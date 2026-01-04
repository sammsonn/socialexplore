from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from geoalchemy2 import functions as geo_func
from shapely.geometry import Point
from datetime import datetime
from typing import Optional
import math
from app.database import get_db
from app.models import Activity, User, Participation, ParticipationStatus
from app.schemas import (
    ActivityCreate, ActivityResponse, ActivityUpdate, ActivityFilter
)
from app.dependencies import get_current_user

router = APIRouter()


def activity_to_dict(activity, current_user_id=None, db=None):
    """Convertește un obiect Activity în dict cu lat/lng"""
    result = {
        "id": activity.id,
        "creator_id": activity.creator_id,
        "title": activity.title,
        "description": activity.description,
        "category": activity.category,
        "start_time": activity.start_time,
        "end_time": activity.end_time,
        "max_people": activity.max_people,
        "is_public": activity.is_public,
        "created_at": activity.created_at
    }

    # Convertim geometria în lat/lng
    if activity.location:
        point = to_shape(activity.location)
        result["latitude"] = point.y
        result["longitude"] = point.x
    else:
        result["latitude"] = None
        result["longitude"] = None

    # Adaugă numele creatorului
    if db:
        creator = db.query(User).filter(User.id == activity.creator_id).first()
        result["creator_name"] = creator.name if creator else None

    # Numără participanții acceptați
    if db:
        participants_count = db.query(func.count(Participation.id)).filter(
            Participation.activity_id == activity.id,
            Participation.status == ParticipationStatus.ACCEPTED
        ).scalar() or 0
        result["participants_count"] = participants_count

    # Verifică participarea utilizatorului curent
    if current_user_id and db:
        participation = db.query(Participation).filter(
            Participation.activity_id == activity.id,
            Participation.user_id == current_user_id
        ).first()
        if participation:
            result["current_user_participation"] = participation.status.value
        else:
            result["current_user_participation"] = None

    return result


@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity_data: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creează o activitate nouă"""
    # Validează că data finală nu este înainte de data inițială
    if activity_data.end_time and activity_data.start_time:
        if activity_data.end_time < activity_data.start_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data finală nu poate fi înainte de data inițială"
            )
    
    # Creează geometrie Point din coordonate
    point = Point(activity_data.longitude, activity_data.latitude)
    location = WKTElement(point.wkt, srid=4326)

    new_activity = Activity(
        creator_id=current_user.id,
        title=activity_data.title,
        description=activity_data.description,
        category=activity_data.category,
        start_time=activity_data.start_time,
        end_time=activity_data.end_time,
        location=location,
        max_people=activity_data.max_people,
        is_public=activity_data.is_public
    )

    db.add(new_activity)
    db.commit()
    db.refresh(new_activity)

    return activity_to_dict(new_activity, current_user.id, db)


@router.get("/", response_model=list[ActivityResponse])
async def get_activities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    category: Optional[str] = None,
    max_distance_km: Optional[float] = Query(None, ge=0),
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    start_time_after: Optional[datetime] = None
):
    """Obține lista de activități cu filtrare opțională"""
    query = db.query(Activity).filter(Activity.is_public == True)

    # Filtrare după categorie
    if category:
        query = query.filter(Activity.category == category)

    # Filtrare după timp
    if start_time_after:
        query = query.filter(Activity.start_time >= start_time_after)

    # Filtrare spațială (distanță)
    if max_distance_km and latitude and longitude:
        # Creează un punct de referință
        reference_point = WKTElement(f"POINT({longitude} {latitude})", srid=4326)
        # Folosește ST_DWithin cu geografie pentru calcul corect al distanței pe sferă
        # Convertim km în metri
        distance_meters = max_distance_km * 1000
        from sqlalchemy import text
        query = query.filter(
            text("ST_DWithin("
                 "ST_GeogFromWKB(ST_AsBinary(activities.location)), "
                 "ST_GeogFromText(:ref_point), "
                 ":distance_meters)"
            ).bindparams(
                ref_point=f"POINT({longitude} {latitude})",
                distance_meters=distance_meters
            )
        )

    activities = query.offset(skip).limit(limit).all()

    return [activity_to_dict(activity, current_user.id, db) for activity in activities]


@router.get("/nearby", response_model=list[ActivityResponse])
async def get_nearby_activities(
    latitude: float = Query(..., description="Latitudine"),
    longitude: float = Query(..., description="Longitudine"),
    radius_km: float = Query(10, ge=0, le=10000, description="Rază în km"),
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține activități în apropiere folosind query spațial PostGIS"""
    # Validează radius_km - dacă este NaN sau invalid, folosește default
    if radius_km is None or (isinstance(radius_km, float) and (radius_km != radius_km or radius_km <= 0)):  # radius_km != radius_km verifica NaN
        radius_km = 10
    
    # Creează un punct de referință
    reference_point = WKTElement(f"POINT({longitude} {latitude})", srid=4326)
    # Convertim km în metri pentru ST_DWithin
    distance_meters = radius_km * 1000

    # Folosim ST_DWithin cu geografie pentru calcul corect al distanței pe sferă
    # Transformăm geometria în geografie folosind funcția ST_GeogFromText sau cast
    from sqlalchemy import text
    query = db.query(Activity).filter(
        Activity.is_public == True,
        text("ST_DWithin("
             "ST_GeogFromWKB(ST_AsBinary(activities.location)), "
             "ST_GeogFromText(:ref_point), "
             ":distance_meters)"
        ).bindparams(
            ref_point=f"POINT({longitude} {latitude})",
            distance_meters=distance_meters
        )
    )

    # Filtrare după categorie dacă este specificată
    if category:
        query = query.filter(Activity.category == category)

    activities = query.all()

    return [activity_to_dict(activity, current_user.id, db) for activity in activities]


@router.get("/my/created", response_model=list[ActivityResponse])
async def get_my_created_activities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține activitățile create de utilizatorul curent"""
    activities = db.query(Activity).filter(
        Activity.creator_id == current_user.id
    ).order_by(Activity.created_at.desc()).all()

    return [activity_to_dict(activity, current_user.id, db) for activity in activities]


@router.get("/grid")
def activities_grid(
    xmin: float,
    ymin: float,
    xmax: float,
    ymax: float,
    cell_km: float = 10,
    db: Session = Depends(get_db),
):
    # build lon/lat expressions from geometry
    lon = func.ST_X(Activity.location)
    lat = func.ST_Y(Activity.location)

    rows = (
        db.query(lon.label("lon"), lat.label("lat"))
        .filter(
            Activity.location.isnot(None),
            lon.between(xmin, xmax),
            lat.between(ymin, ymax),
        )
        .all()
    )

    def snap(val, step):
        return math.floor(val / step) * step

    DEG_PER_KM = 1 / 111.0
    step = cell_km * DEG_PER_KM

    buckets = {}
    for r in rows:
        gx = snap(r.lon, step)
        gy = snap(r.lat, step)
        buckets[(gx, gy)] = buckets.get((gx, gy), 0) + 1

    features = []
    for (gx, gy), count in buckets.items():
        features.append({
            "type": "Feature",
            "properties": {"count": count},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [gx, gy],
                    [gx + step, gy],
                    [gx + step, gy + step],
                    [gx, gy + step],
                    [gx, gy],
                ]]
            }
        })

    return {"type": "FeatureCollection", "features": features}



@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține o activitate specifică"""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    return activity_to_dict(activity, current_user.id, db)


@router.put("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: int,
    activity_update: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualizează o activitate"""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Doar creatorul poate actualiza activitatea
    if activity.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doar creatorul poate actualiza activitatea"
        )

    # Validează că data finală nu este înainte de data inițială
    start_time = activity_update.start_time if activity_update.start_time else activity.start_time
    end_time = activity_update.end_time if activity_update.end_time is not None else activity.end_time

    if end_time and start_time:
        if end_time < start_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data finală nu poate fi înainte de data inițială"
            )

    # Actualizează câmpurile
    if activity_update.title is not None:
        activity.title = activity_update.title
    if activity_update.description is not None:
        activity.description = activity_update.description
    if activity_update.category is not None:
        activity.category = activity_update.category
    if activity_update.start_time is not None:
        activity.start_time = activity_update.start_time
    if activity_update.end_time is not None:
        activity.end_time = activity_update.end_time
    if activity_update.max_people is not None:
        activity.max_people = activity_update.max_people
    if activity_update.is_public is not None:
        activity.is_public = activity_update.is_public

    # Actualizează locația dacă este furnizată
    if activity_update.latitude is not None and activity_update.longitude is not None:
        point = Point(activity_update.longitude, activity_update.latitude)
        activity.location = WKTElement(point.wkt, srid=4326)

    db.commit()
    db.refresh(activity)

    return activity_to_dict(activity, current_user.id, db)

@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Șterge o activitate"""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Doar creatorul poate șterge activitatea
    if activity.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doar creatorul poate șterge activitatea"
        )

    db.delete(activity)
    db.commit()

    return {"message": "Activitate ștearsă cu succes"}

@router.get("/by-county")
def activities_by_county(db: Session = Depends(get_db)):
    sql = """
    SELECT
        c.nuts_id,
        c.name_latn,
        COUNT(a.id) AS activity_count
    FROM romania_counties c
    LEFT JOIN activities a
        ON a.location IS NOT NULL
        AND ST_Contains(c.geom, a.location)
    WHERE c.cntr_code = 'RO'
    GROUP BY c.nuts_id, c.name_latn
    """
    rows = db.execute(sql).fetchall()

    return [
        {
            "nuts_id": r.nuts_id,
            "name": r.name_latn,
            "activity_count": r.activity_count
        }
        for r in rows
    ]
