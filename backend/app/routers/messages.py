from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Message, Activity, Participation, ParticipationStatus, User
from app.schemas import MessageCreate, MessageResponse, NotificationItem, NotificationsResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creează un mesaj într-o activitate"""
    # Verifică dacă activitatea există
    activity = db.query(Activity).filter(Activity.id == message_data.activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Verifică dacă utilizatorul este creatorul sau are participare acceptată
    is_creator = activity.creator_id == current_user.id
    is_participant = db.query(Participation).filter(
        Participation.activity_id == message_data.activity_id,
        Participation.user_id == current_user.id,
        Participation.status == ParticipationStatus.ACCEPTED
    ).first() is not None

    if not (is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trebuie să fii creator sau participant acceptat pentru a trimite mesaje"
        )

    # Creează mesajul
    new_message = Message(
        activity_id=message_data.activity_id,
        sender_id=current_user.id,
        text=message_data.text
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    return {
        "id": new_message.id,
        "activity_id": new_message.activity_id,
        "sender_id": new_message.sender_id,
        "sender_name": current_user.name,
        "text": new_message.text,
        "created_at": new_message.created_at
    }


@router.get("/activity/{activity_id}", response_model=list[MessageResponse])
async def get_activity_messages(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține mesajele unei activități"""
    # Verifică dacă activitatea există
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Verifică dacă utilizatorul este creatorul sau are participare acceptată
    is_creator = activity.creator_id == current_user.id
    is_participant = db.query(Participation).filter(
        Participation.activity_id == activity_id,
        Participation.user_id == current_user.id,
        Participation.status == ParticipationStatus.ACCEPTED
    ).first() is not None

    if not (is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trebuie să fii creator sau participant acceptat pentru a vedea mesajele"
        )

    messages = db.query(Message).filter(
        Message.activity_id == activity_id
    ).order_by(Message.created_at.asc()).all()

    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        result.append({
            "id": msg.id,
            "activity_id": msg.activity_id,
            "sender_id": msg.sender_id,
            "sender_name": sender.name if sender else None,
            "text": msg.text,
            "created_at": msg.created_at
        })

    return result

