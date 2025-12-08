from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.shape import to_shape
from typing import Optional, List
from app.database import get_db
from app.models import User
from app.schemas import NearbyUsersRequest, NearbyUsersResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/users/nearby", response_model=list[NearbyUsersResponse])
async def get_nearby_users(
    latitude: float = Query(..., description="Latitudine"),
    longitude: float = Query(..., description="Longitudine"),
    radius_km: float = Query(10, ge=0, description="Rază în km"),
    interests: Optional[str] = Query(None, description="Interese separate prin virgulă"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Găsește utilizatori în apropiere folosind query spațial PostGIS"""
    print(f"[DEBUG SEARCH] User {current_user.id} ({current_user.name}) caută utilizatori la lat={latitude}, lng={longitude}, radius={radius_km}km")
    
    # Convertim km în metri pentru ST_DWithin
    distance_meters = radius_km * 1000

    # Verifică câți utilizatori există în total
    total_users = db.query(User).filter(User.id != current_user.id).count()
    users_with_location = db.query(User).filter(
        User.id != current_user.id,
        User.home_location.isnot(None)
    ).count()
    print(f"[DEBUG SEARCH] Total utilizatori (fără current): {total_users}, cu locație: {users_with_location}")

    # Folosim ST_DWithin cu geografie pentru calcul corect al distanței pe sferă
    from sqlalchemy import text
    query = db.query(User).filter(
        User.id != current_user.id,  # Exclude utilizatorul curent
        User.home_location.isnot(None),
        text("ST_DWithin("
             "ST_GeogFromWKB(ST_AsBinary(users.home_location)), "
             "ST_GeogFromText(:ref_point), "
             ":distance_meters)"
        ).bindparams(
            ref_point=f"POINT({longitude} {latitude})",
            distance_meters=distance_meters
        )
    )

    # Filtrare după interese dacă sunt specificate
    if interests:
        interest_list = [i.strip().lower() for i in interests.split(",")]
        # Filtrare simplificată - verifică dacă interesele utilizatorului se suprapun
        # Aceasta funcționează dacă interesele sunt stocate ca listă JSON
        conditions = []
        for interest in interest_list:
            conditions.append(f"LOWER(interests::text) LIKE '%{interest}%'")
        if conditions:
            query = query.filter(text(" OR ".join(conditions)))

    users = query.all()
    print(f"[DEBUG SEARCH] Găsiți {len(users)} utilizatori în apropiere")

    result = []
    ref_point_text = f"POINT({longitude} {latitude})"
    
    for user in users:
        if user.home_location:
            point = to_shape(user.home_location)
            # Calculează distanța folosind geografie pentru calcul corect pe sferă
            # Folosim query direct cu ST_AsBinary din coloana existentă
            try:
                distance_result = db.execute(
                    text("SELECT ST_Distance("
                         "ST_GeogFromWKB(ST_AsBinary(users.home_location)), "
                         "ST_GeogFromText(:ref_point)"
                         ") as distance "
                         "FROM users WHERE users.id = :user_id"),
                    {
                        "ref_point": ref_point_text,
                        "user_id": user.id
                    }
                ).scalar()
                
                # Convertim din metri în km
                distance_km = distance_result / 1000.0 if distance_result else None
            except Exception as e:
                print(f"[DEBUG SEARCH] Eroare la calcularea distanței pentru user {user.id}: {e}")
                # Dacă calculul distanței eșuează, folosim None
                distance_km = None

            result.append({
                "id": user.id,
                "name": user.name,
                "bio": user.bio,
                "interests": user.interests,
                "latitude": point.y,
                "longitude": point.x,
                "distance_km": distance_km
            })

    # Sortează după distanță
    result.sort(key=lambda x: x["distance_km"] if x["distance_km"] else float('inf'))

    return result

