from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from shapely.geometry import Point
from app.database import get_db
from app.models import User, Activity, Participation, FriendRequest
from app.schemas import UserResponse, UserUpdate, UserProfileResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obține informații despre utilizatorul curent"""
    # Convertim locația în lat/lng
    latitude = None
    longitude = None
    if current_user.home_location:
        point = to_shape(current_user.home_location)
        latitude = point.y
        longitude = point.x

    # Numără activitățile create
    created_count = db.query(func.count(Activity.id)).filter(
        Activity.creator_id == current_user.id
    ).scalar() or 0

    # Numără participările
    participations_count = db.query(func.count(Participation.id)).filter(
        Participation.user_id == current_user.id,
        Participation.status == "accepted"
    ).scalar() or 0

    # Numără prietenii (cereri acceptate)
    friends_count = (
        db.query(func.count(FriendRequest.id)).filter(
            ((FriendRequest.from_user_id == current_user.id) |
             (FriendRequest.to_user_id == current_user.id)),
            FriendRequest.status == "accepted"
        ).scalar() or 0
    )

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "bio": current_user.bio,
        "interests": current_user.interests,
        "visibility_radius_km": current_user.visibility_radius_km,
        "created_at": current_user.created_at,
        "latitude": latitude,
        "longitude": longitude,
        "created_activities_count": created_count,
        "participations_count": participations_count,
        "friends_count": friends_count
    }


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Actualizează profilul utilizatorului curent"""
    if user_update.name is not None:
        current_user.name = user_update.name
    if user_update.bio is not None:
        current_user.bio = user_update.bio
    if user_update.interests is not None:
        current_user.interests = user_update.interests
    if user_update.visibility_radius_km is not None:
        current_user.visibility_radius_km = user_update.visibility_radius_km

    # Actualizează locația dacă este furnizată
    if user_update.latitude is not None and user_update.longitude is not None:
        point = Point(user_update.longitude, user_update.latitude)
        current_user.home_location = WKTElement(point.wkt, srid=4326)

    db.commit()
    db.refresh(current_user)

    # Convertim locația în lat/lng pentru response
    latitude = None
    longitude = None
    if current_user.home_location:
        point = to_shape(current_user.home_location)
        latitude = point.y
        longitude = point.x

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "bio": current_user.bio,
        "interests": current_user.interests,
        "visibility_radius_km": current_user.visibility_radius_km,
        "created_at": current_user.created_at,
        "latitude": latitude,
        "longitude": longitude
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține informații despre un utilizator specific"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilizator nu a fost găsit"
        )

    # Convertim locația în lat/lng
    latitude = None
    longitude = None
    if user.home_location:
        point = to_shape(user.home_location)
        latitude = point.y
        longitude = point.x

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "interests": user.interests,
        "visibility_radius_km": user.visibility_radius_km,
        "created_at": user.created_at,
        "latitude": latitude,
        "longitude": longitude
    }
