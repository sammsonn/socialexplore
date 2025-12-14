from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Participation, Activity, User, ParticipationStatus, ReadNotification, Message, FriendRequest
from app.schemas import ParticipationCreate, ParticipationResponse, ParticipationUpdate, NotificationItem, NotificationsResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.post("/", response_model=ParticipationResponse, status_code=status.HTTP_201_CREATED)
async def create_participation(
    participation_data: ParticipationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creează o cerere de participare la activitate"""
    # Verifică dacă activitatea există
    activity = db.query(Activity).filter(Activity.id == participation_data.activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Verifică dacă utilizatorul este creatorul
    if activity.creator_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nu poți participa la propria activitate"
        )

    # Verifică dacă există deja o participare
    existing = db.query(Participation).filter(
        Participation.activity_id == participation_data.activity_id,
        Participation.user_id == current_user.id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ai trimis deja o cerere de participare"
        )

    # Verifică dacă activitatea are locuri disponibile
    if activity.max_people:
        accepted_count = db.query(Participation).filter(
            Participation.activity_id == activity.id,
            Participation.status == ParticipationStatus.ACCEPTED
        ).count()
        if accepted_count >= activity.max_people:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Activitatea este plină"
            )

    # Creează participarea
    new_participation = Participation(
        activity_id=participation_data.activity_id,
        user_id=current_user.id,
        status=ParticipationStatus.PENDING
    )

    db.add(new_participation)
    db.commit()
    db.refresh(new_participation)

    return {
        "id": new_participation.id,
        "activity_id": new_participation.activity_id,
        "user_id": new_participation.user_id,
        "user_name": current_user.name,
        "status": new_participation.status.value,
        "joined_at": new_participation.joined_at
    }


@router.get("/activity/{activity_id}", response_model=list[ParticipationResponse])
async def get_activity_participations(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține lista de participări pentru o activitate"""
    # Verifică dacă activitatea există
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activitate nu a fost găsită"
        )

    # Doar creatorul poate vedea toate participările
    if activity.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doar creatorul activității poate vedea participările"
        )

    participations = db.query(Participation).filter(
        Participation.activity_id == activity_id
    ).all()

    result = []
    for part in participations:
        user = db.query(User).filter(User.id == part.user_id).first()
        result.append({
            "id": part.id,
            "activity_id": part.activity_id,
            "user_id": part.user_id,
            "user_name": user.name if user else None,
            "status": part.status.value,
            "joined_at": part.joined_at
        })

    return result


@router.put("/{participation_id}", response_model=ParticipationResponse)
async def update_participation(
    participation_id: int,
    participation_update: ParticipationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualizează statusul unei participări (accept/reject)"""
    participation = db.query(Participation).filter(Participation.id == participation_id).first()
    if not participation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participare nu a fost găsită"
        )

    # Verifică dacă utilizatorul este creatorul activității
    activity = db.query(Activity).filter(Activity.id == participation.activity_id).first()
    if activity.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doar creatorul activității poate aproba/respinge participările"
        )

    # Actualizează statusul
    if participation_update.status == "accepted":
        participation.status = ParticipationStatus.ACCEPTED
        # Verifică dacă activitatea este plină
        if activity.max_people:
            accepted_count = db.query(Participation).filter(
                Participation.activity_id == activity.id,
                Participation.status == ParticipationStatus.ACCEPTED
            ).count()
            if accepted_count >= activity.max_people:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Activitatea este deja plină"
                )
    elif participation_update.status == "rejected":
        participation.status = ParticipationStatus.REJECTED
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status invalid. Folosește 'accepted' sau 'rejected'"
        )

    db.commit()
    db.refresh(participation)

    user = db.query(User).filter(User.id == participation.user_id).first()
    return {
        "id": participation.id,
        "activity_id": participation.activity_id,
        "user_id": participation.user_id,
        "user_name": user.name if user else None,
        "status": participation.status.value,
        "joined_at": participation.joined_at
    }


@router.delete("/{participation_id}")
async def delete_participation(
    participation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Anulează o participare"""
    participation = db.query(Participation).filter(Participation.id == participation_id).first()
    if not participation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participare nu a fost găsită"
        )

    # Doar utilizatorul care a creat participarea sau creatorul activității o poate șterge
    if participation.user_id != current_user.id:
        activity = db.query(Activity).filter(Activity.id == participation.activity_id).first()
        if activity.creator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu ai permisiunea să ștergi această participare"
            )

    db.delete(participation)
    db.commit()

    return {"message": "Participare anulată cu succes"}


@router.get("/my/activities", response_model=list[ParticipationResponse])
async def get_my_participations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține toate participările utilizatorului curent"""
    participations = db.query(Participation).filter(
        Participation.user_id == current_user.id
    ).all()

    result = []
    for part in participations:
        result.append({
            "id": part.id,
            "activity_id": part.activity_id,
            "user_id": part.user_id,
            "user_name": current_user.name,
            "status": part.status.value,
            "joined_at": part.joined_at
        })

    return result


@router.get("/notifications/count")
async def get_notifications_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține numărul de notificări (cereri de participare pending + mesaje noi + cereri de prietenie)"""
    from datetime import datetime, timedelta
    from app.models import Message, FriendRequest, FriendRequestStatus
    
    # Găsește toate activitățile create de utilizator
    my_activities = db.query(Activity).filter(Activity.creator_id == current_user.id).all()
    activity_ids = [activity.id for activity in my_activities]
    
    count = 0
    pending_count = 0
    
    # Găsește notificările citite de utilizator (trebuie să fie înainte de calcule)
    read_notifications = db.query(ReadNotification).filter(
        ReadNotification.user_id == current_user.id
    ).all()
    read_keys = {(rn.notification_type, rn.notification_id) for rn in read_notifications}
    
    # 0. Numără cererile de prietenie primite (pending) - excludând cele citite
    received_friend_requests = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).all()
    for req in received_friend_requests:
        if ("friend_request_received", req.id) not in read_keys:
            count += 1
    
    # 0.1. Numără cererile de prietenie acceptate (unde utilizatorul curent a trimis cererea) - excludând cele citite
    accepted_friend_requests = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.ACCEPTED
    ).all()
    # Doar cele din ultimele 24 de ore
    yesterday = datetime.utcnow() - timedelta(hours=24)
    for req in accepted_friend_requests:
        if req.created_at >= yesterday:  # Doar cererile acceptate recent
            if ("friend_request_accepted", req.id) not in read_keys:
                count += 1
    
    # 1. Numără cererile de participare pending pentru activitățile create de utilizator (excluzând cele citite)
    if activity_ids:
        pending_participations = db.query(Participation).filter(
            Participation.activity_id.in_(activity_ids),
            Participation.status == ParticipationStatus.PENDING
        ).all()
        # Numără doar cele care nu au fost citite
        for part in pending_participations:
            if ("participation_request", part.id) not in read_keys:
                pending_count += 1
        count += pending_count
    
    # 2. Numără mesajele noi (ultimele 24 de ore) în activitățile create SAU la care participă
    # Găsește activitățile la care utilizatorul participă (acceptat)
    my_participations = db.query(Participation).filter(
        Participation.user_id == current_user.id,
        Participation.status == ParticipationStatus.ACCEPTED
    ).all()
    participated_activity_ids = [part.activity_id for part in my_participations]
    
    # Combină activitățile create și cele la care participă
    all_relevant_activity_ids = list(set(activity_ids + participated_activity_ids))
    
    # DEBUG: Log pentru a vedea ce activități sunt relevante
    print(f"[DEBUG NOTIFICATIONS COUNT] User {current_user.id} ({current_user.name}):")
    print(f"  - Created activities: {activity_ids}")
    print(f"  - Participated activities: {participated_activity_ids}")
    print(f"  - All relevant activities: {all_relevant_activity_ids}")
    
    if all_relevant_activity_ids:
        yesterday = datetime.utcnow() - timedelta(hours=24)
        recent_messages = db.query(Message).filter(
            Message.activity_id.in_(all_relevant_activity_ids),
            Message.sender_id != current_user.id,
            Message.created_at >= yesterday
        ).order_by(Message.created_at.desc()).all()
        
        # DEBUG: Log pentru a vedea ce mesaje sunt găsite
        print(f"  - Recent messages found: {len(recent_messages)}")
        for msg in recent_messages:
            sender = db.query(User).filter(User.id == msg.sender_id).first()
            activity = db.query(Activity).filter(Activity.id == msg.activity_id).first()
            print(f"    * Message {msg.id} from {sender.name if sender else 'Unknown'} (ID: {msg.sender_id}) in activity {msg.activity_id} ('{activity.title if activity else 'Unknown'}') at {msg.created_at}")
        
        # Grupează mesajele pe activitate și utilizator (doar ultimul mesaj per combinație)
        # IMPORTANT: Pentru mesaje, verificăm dacă ultimul mesaj NOU de la acel sender în acea activitate
        # a fost deja marcat ca citit. Dacă da, nu mai generăm notificare.
        seen_combinations = set()
        for msg in recent_messages:
            key = (msg.activity_id, msg.sender_id)
            if key not in seen_combinations:
                seen_combinations.add(key)
                # Găsește ultimul mesaj NOU (din ultimele 24h) de la acest sender în acea activitate
                latest_message = db.query(Message).filter(
                    Message.activity_id == msg.activity_id,
                    Message.sender_id == msg.sender_id,
                    Message.created_at >= yesterday
                ).order_by(Message.created_at.desc()).first()
                
                # Verifică dacă ultimul mesaj NOU a fost deja marcat ca citit
                has_read_notification = False
                if latest_message:
                    has_read_notification = db.query(ReadNotification).filter(
                        ReadNotification.user_id == current_user.id,
                        ReadNotification.notification_type == "new_message",
                        ReadNotification.notification_id == latest_message.id
                    ).first() is not None
                
                if not has_read_notification:
                    count += 1
                    # DEBUG: Log pentru a vedea ce notificări sunt numărate
                    sender = db.query(User).filter(User.id == msg.sender_id).first()
                    activity = db.query(Activity).filter(Activity.id == msg.activity_id).first()
                    print(f"    -> ✓ Counting notification for message {latest_message.id if latest_message else 'N/A'} from {sender.name if sender else 'Unknown'} in activity {msg.activity_id} ('{activity.title if activity else 'Unknown'}')")
                else:
                    # DEBUG: Log pentru a vedea ce notificări sunt excluse
                    sender = db.query(User).filter(User.id == msg.sender_id).first()
                    activity = db.query(Activity).filter(Activity.id == msg.activity_id).first()
                    print(f"    -> ✗ Skipping notification (latest message {latest_message.id if latest_message else 'N/A'} already read) for message from {sender.name if sender else 'Unknown'} in activity {msg.activity_id} ('{activity.title if activity else 'Unknown'}')")
    
    return {
        "count": count,
        "pending_participations": pending_count
    }


@router.get("/notifications", response_model=NotificationsResponse)
async def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține lista de notificări (cereri de participare pending + mesaje noi + cereri de prietenie)"""
    from datetime import datetime, timedelta
    from app.models import Message, FriendRequest, FriendRequestStatus
    
    # Găsește toate activitățile create de utilizator
    my_activities = db.query(Activity).filter(Activity.creator_id == current_user.id).all()
    activity_ids = [activity.id for activity in my_activities]
    
    notifications = []
    
    # Găsește notificările citite de utilizator
    read_notifications = db.query(ReadNotification).filter(
        ReadNotification.user_id == current_user.id
    ).all()
    read_keys = {(rn.notification_type, rn.notification_id) for rn in read_notifications}
    
    # 0. Cereri de prietenie primite (pending)
    received_friend_requests = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).order_by(FriendRequest.created_at.desc()).all()
    
    for req in received_friend_requests:
        if ("friend_request_received", req.id) in read_keys:
            continue
        
        from_user = db.query(User).filter(User.id == req.from_user_id).first()
        if from_user:
            notifications.append(NotificationItem(
                id=req.id,
                type="friend_request_received",
                activity_id=None,
                activity_title=None,
                user_name=from_user.name,
                user_id=from_user.id,
                message=f"{from_user.name} ți-a trimis o cerere de prietenie",
                created_at=req.created_at
            ))
    
    # 0.1. Cereri de prietenie acceptate (unde utilizatorul curent a trimis cererea) - doar din ultimele 24h
    yesterday = datetime.utcnow() - timedelta(hours=24)
    accepted_friend_requests = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.ACCEPTED,
        FriendRequest.created_at >= yesterday  # Doar cele acceptate recent
    ).order_by(FriendRequest.created_at.desc()).all()
    
    for req in accepted_friend_requests:
        if ("friend_request_accepted", req.id) in read_keys:
            continue
        
        to_user = db.query(User).filter(User.id == req.to_user_id).first()
        if to_user:
            notifications.append(NotificationItem(
                id=req.id,
                type="friend_request_accepted",
                activity_id=None,
                activity_title=None,
                user_name=to_user.name,
                user_id=to_user.id,
                message=f"{to_user.name} a acceptat cererea ta de prietenie",
                created_at=req.created_at
            ))
    
    # 1. Cereri de participare pending
    if activity_ids:
        pending_participations = db.query(Participation).filter(
            Participation.activity_id.in_(activity_ids),
            Participation.status == ParticipationStatus.PENDING
        ).order_by(Participation.joined_at.desc()).all()
        
        for part in pending_participations:
            # Verifică dacă notificarea a fost deja citită
            if ("participation_request", part.id) in read_keys:
                continue
                
            activity = db.query(Activity).filter(Activity.id == part.activity_id).first()
            user = db.query(User).filter(User.id == part.user_id).first()
            
            if activity and user:
                notifications.append(NotificationItem(
                    id=part.id,
                    type="participation_request",
                    activity_id=activity.id,
                    activity_title=activity.title,
                    user_name=user.name,
                    user_id=user.id,
                    message=f"{user.name} a cerut să se înscrie la evenimentul \"{activity.title}\"",
                    created_at=part.joined_at
                ))
    
    # 2. Mesaje noi (ultimele 24 de ore) în activitățile create de utilizator SAU la care participă
    # Găsește activitățile la care utilizatorul participă (acceptat)
    my_participations = db.query(Participation).filter(
        Participation.user_id == current_user.id,
        Participation.status == ParticipationStatus.ACCEPTED
    ).all()
    participated_activity_ids = [part.activity_id for part in my_participations]
    
    # Combină activitățile create și cele la care participă
    all_relevant_activity_ids = list(set(activity_ids + participated_activity_ids))
    
    if all_relevant_activity_ids:
        yesterday = datetime.utcnow() - timedelta(hours=24)
        recent_messages = db.query(Message).filter(
            Message.activity_id.in_(all_relevant_activity_ids),
            Message.sender_id != current_user.id,
            Message.created_at >= yesterday
        ).order_by(Message.created_at.desc()).all()
        
        # Grupează mesajele pe activitate și utilizator (doar ultimul mesaj per combinație)
        # IMPORTANT: Pentru mesaje, verificăm dacă ultimul mesaj NOU de la acel sender în acea activitate
        # a fost deja marcat ca citit. Dacă da, nu mai generăm notificare.
        seen_combinations = set()
        for msg in recent_messages:
            key = (msg.activity_id, msg.sender_id)
            if key not in seen_combinations:
                seen_combinations.add(key)
                # Găsește ultimul mesaj NOU (din ultimele 24h) de la acest sender în acea activitate
                latest_message = db.query(Message).filter(
                    Message.activity_id == msg.activity_id,
                    Message.sender_id == msg.sender_id,
                    Message.created_at >= yesterday
                ).order_by(Message.created_at.desc()).first()
                
                # Verifică dacă ultimul mesaj NOU a fost deja marcat ca citit
                has_read_notification = False
                if latest_message:
                    has_read_notification = db.query(ReadNotification).filter(
                        ReadNotification.user_id == current_user.id,
                        ReadNotification.notification_type == "new_message",
                        ReadNotification.notification_id == latest_message.id
                    ).first() is not None
                
                if has_read_notification:
                    continue
                    
                activity = db.query(Activity).filter(Activity.id == msg.activity_id).first()
                sender = db.query(User).filter(User.id == msg.sender_id).first()
                
                if activity and sender and latest_message:
                    notifications.append(NotificationItem(
                        id=latest_message.id,
                        type="new_message",
                        activity_id=activity.id,
                        activity_title=activity.title,
                        user_name=sender.name,
                        user_id=sender.id,
                        message=f"{sender.name} a trimis un mesaj pentru evenimentul \"{activity.title}\"",
                        created_at=latest_message.created_at
                    ))
    
    # Sortează notificările după dată (cele mai recente primele)
    notifications.sort(key=lambda x: x.created_at, reverse=True)
    
    return NotificationsResponse(
        notifications=notifications,
        count=len(notifications)
    )


@router.post("/notifications/{notification_type}/{notification_id}/read")
async def mark_notification_as_read(
    notification_type: str,
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marchează o notificare ca citită"""
    # Găsește activitatea pentru a obține activity_id
    activity_id = None
    sender_id = None
    
    friend_request_id = None
    
    if notification_type == "participation_request":
        participation = db.query(Participation).filter(Participation.id == notification_id).first()
        if participation:
            activity_id = participation.activity_id
    elif notification_type == "new_message":
        message = db.query(Message).filter(Message.id == notification_id).first()
        if message:
            activity_id = message.activity_id
            sender_id = message.sender_id
    elif notification_type == "friend_request_received" or notification_type == "friend_request_accepted":
        try:
            friend_request = db.query(FriendRequest).filter(FriendRequest.id == notification_id).first()
            if friend_request:
                friend_request_id = friend_request.id
            else:
                # Dacă cererea nu există, înseamnă că notificarea este invalidă
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Cerere de prietenie cu ID {notification_id} nu a fost găsită"
                )
        except Exception as e:
            print(f"[ERROR] Eroare la găsirea cererii de prietenie {notification_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Eroare la procesarea notificării: {str(e)}"
            )
    
    # Pentru notificările de prietenie, nu avem activity_id
    if not activity_id and not friend_request_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificare nu a fost găsită"
        )
    
    # Pentru mesaje, marchem doar mesajele NOI (din ultimele 24h) de la acel sender în acea activitate ca citite
    # (pentru a fi consistent cu logica de grupare și pentru a permite notificări pentru mesaje noi ulterioare)
    if notification_type == "new_message" and sender_id:
        from datetime import datetime, timedelta
        yesterday = datetime.utcnow() - timedelta(hours=24)
        
        # Găsește doar mesajele NOI (din ultimele 24h) de la acest sender în acea activitate
        new_messages = db.query(Message).filter(
            Message.activity_id == activity_id,
            Message.sender_id == sender_id,
            Message.created_at >= yesterday
        ).all()
        
        # Marchează fiecare mesaj NOU ca citit (dacă nu este deja marcat)
        for msg in new_messages:
            existing = db.query(ReadNotification).filter(
                ReadNotification.user_id == current_user.id,
                ReadNotification.notification_type == "new_message",
                ReadNotification.notification_id == msg.id
            ).first()
            
            if not existing:
                read_notification = ReadNotification(
                    user_id=current_user.id,
                    notification_type="new_message",
                    notification_id=msg.id,
                    activity_id=activity_id,
                    friend_request_id=None
                )
                db.add(read_notification)
    elif notification_type == "participation_request":
        # Pentru participation_request, marchează doar cererea specifică
        existing = db.query(ReadNotification).filter(
            ReadNotification.user_id == current_user.id,
            ReadNotification.notification_type == notification_type,
            ReadNotification.notification_id == notification_id
        ).first()
        
        if not existing:
            read_notification = ReadNotification(
                user_id=current_user.id,
                notification_type=notification_type,
                notification_id=notification_id,
                activity_id=activity_id,
                friend_request_id=None
            )
            db.add(read_notification)
    elif notification_type == "friend_request_received" or notification_type == "friend_request_accepted":
        # Pentru cereri de prietenie, marchează cererea specifică
        existing = db.query(ReadNotification).filter(
            ReadNotification.user_id == current_user.id,
            ReadNotification.notification_type == notification_type,
            ReadNotification.notification_id == notification_id
        ).first()
        
        if not existing:
            read_notification = ReadNotification(
                user_id=current_user.id,
                notification_type=notification_type,
                notification_id=notification_id,
                activity_id=None,
                friend_request_id=friend_request_id
            )
            db.add(read_notification)
    
    db.commit()
    
    return {"message": "Notificare marcată ca citită"}

