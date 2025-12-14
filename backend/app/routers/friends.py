from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.models import FriendRequest, User, FriendRequestStatus, ReadNotification
from app.schemas import FriendRequestCreate, FriendRequestResponse, FriendRequestUpdate, UserResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.post("/requests", response_model=FriendRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_friend_request(
    friend_request_data: FriendRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creează o cerere de prietenie"""
    # Verifică dacă utilizatorul țintă există
    to_user = db.query(User).filter(User.id == friend_request_data.to_user_id).first()
    if not to_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilizator nu a fost găsit"
        )

    # Nu poți trimite cerere de prietenie ție însuți
    if friend_request_data.to_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nu poți trimite cerere de prietenie ție însuți"
        )

    # Verifică dacă există deja o cerere
    existing = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.from_user_id == current_user.id) &
            (FriendRequest.to_user_id == friend_request_data.to_user_id),
            (FriendRequest.from_user_id == friend_request_data.to_user_id) &
            (FriendRequest.to_user_id == current_user.id)
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Există deja o cerere de prietenie între voi"
        )

    # Creează cererea
    new_request = FriendRequest(
        from_user_id=current_user.id,
        to_user_id=friend_request_data.to_user_id,
        status=FriendRequestStatus.PENDING
    )

    db.add(new_request)
    db.commit()
    db.refresh(new_request)

    return {
        "id": new_request.id,
        "from_user_id": new_request.from_user_id,
        "from_user_name": current_user.name,
        "to_user_id": new_request.to_user_id,
        "to_user_name": to_user.name,
        "status": new_request.status.value,
        "created_at": new_request.created_at
    }


@router.get("/requests/received", response_model=list[FriendRequestResponse])
async def get_received_friend_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține cererile de prietenie primite"""
    requests = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).all()

    result = []
    for req in requests:
        from_user = db.query(User).filter(User.id == req.from_user_id).first()
        result.append({
            "id": req.id,
            "from_user_id": req.from_user_id,
            "from_user_name": from_user.name if from_user else None,
            "to_user_id": req.to_user_id,
            "to_user_name": current_user.name,
            "status": req.status.value,
            "created_at": req.created_at
        })

    return result


@router.get("/requests/sent", response_model=list[FriendRequestResponse])
async def get_sent_friend_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține cererile de prietenie trimise"""
    requests = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).all()

    result = []
    for req in requests:
        to_user = db.query(User).filter(User.id == req.to_user_id).first()
        result.append({
            "id": req.id,
            "from_user_id": req.from_user_id,
            "from_user_name": current_user.name,
            "to_user_id": req.to_user_id,
            "to_user_name": to_user.name if to_user else None,
            "status": req.status.value,
            "created_at": req.created_at
        })

    return result


@router.put("/requests/{request_id}", response_model=FriendRequestResponse)
async def update_friend_request(
    request_id: int,
    friend_request_update: FriendRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualizează statusul unei cereri de prietenie (accept/reject)"""
    friend_request = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cerere de prietenie nu a fost găsită"
        )

    # Doar utilizatorul care a primit cererea o poate accepta/respinge
    if friend_request.to_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nu ai permisiunea să actualizezi această cerere"
        )

    # Actualizează statusul
    if friend_request_update.status == "accepted":
        friend_request.status = FriendRequestStatus.ACCEPTED
    elif friend_request_update.status == "rejected":
        friend_request.status = FriendRequestStatus.REJECTED
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status invalid. Folosește 'accepted' sau 'rejected'"
        )

    db.commit()
    db.refresh(friend_request)

    from_user = db.query(User).filter(User.id == friend_request.from_user_id).first()
    to_user = db.query(User).filter(User.id == friend_request.to_user_id).first()

    return {
        "id": friend_request.id,
        "from_user_id": friend_request.from_user_id,
        "from_user_name": from_user.name if from_user else None,
        "to_user_id": friend_request.to_user_id,
        "to_user_name": to_user.name if to_user else None,
        "status": friend_request.status.value,
        "created_at": friend_request.created_at
    }


@router.get("/", response_model=list[UserResponse])
async def get_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține lista de prieteni (cereri acceptate)"""
    # Găsește toate cererile acceptate unde utilizatorul curent este implicat
    friend_requests = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.from_user_id == current_user.id),
            (FriendRequest.to_user_id == current_user.id)
        ),
        FriendRequest.status == FriendRequestStatus.ACCEPTED
    ).all()

    friend_ids = set()
    for req in friend_requests:
        if req.from_user_id == current_user.id:
            friend_ids.add(req.to_user_id)
        else:
            friend_ids.add(req.from_user_id)

    friends = db.query(User).filter(User.id.in_(friend_ids)).all()

    from geoalchemy2.shape import to_shape
    result = []
    for friend in friends:
        latitude = None
        longitude = None
        if friend.home_location:
            point = to_shape(friend.home_location)
            latitude = point.y
            longitude = point.x

        result.append({
            "id": friend.id,
            "name": friend.name,
            "email": friend.email,
            "bio": friend.bio,
            "interests": friend.interests,
            "visibility_radius_km": friend.visibility_radius_km,
            "created_at": friend.created_at,
            "latitude": latitude,
            "longitude": longitude
        })

    return result


@router.delete("/{friend_id}")
async def remove_friend(
    friend_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Șterge o prietenie (șterge cererea de prietenie acceptată)"""
    # Găsește cererea de prietenie acceptată între utilizatorul curent și prieten
    friend_request = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.from_user_id == current_user.id) &
            (FriendRequest.to_user_id == friend_id),
            (FriendRequest.from_user_id == friend_id) &
            (FriendRequest.to_user_id == current_user.id)
        ),
        FriendRequest.status == FriendRequestStatus.ACCEPTED
    ).first()
    
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prietenie nu a fost găsită"
        )
    
    # Șterge mai întâi toate notificările care referă această cerere de prietenie
    db.query(ReadNotification).filter(
        ReadNotification.friend_request_id == friend_request.id
    ).delete()
    
    # Șterge cererea de prietenie
    db.delete(friend_request)
    db.commit()
    
    return {"message": "Prietenie ștearsă cu succes"}

