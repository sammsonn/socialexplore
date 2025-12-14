from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from datetime import datetime, timedelta
from typing import List, Dict
from app.database import get_db
from app.models import Activity, User, Participation, ParticipationStatus, FriendRequest
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/general")
async def get_general_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Statistici generale pentru dashboard"""
    
    # Total activități
    total_activities = db.query(func.count(Activity.id)).scalar() or 0
    
    # Total utilizatori
    total_users = db.query(func.count(User.id)).scalar() or 0
    
    # Total participări acceptate
    total_participations = db.query(func.count(Participation.id)).filter(
        Participation.status == ParticipationStatus.ACCEPTED
    ).scalar() or 0
    
    # Activități pe categorii
    category_stats = db.query(
        Activity.category,
        func.count(Activity.id).label('count')
    ).group_by(Activity.category).all()
    
    categories = [{"name": cat, "count": count} for cat, count in category_stats]
    
    # Activități create în ultimele 6 luni
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    activities_by_month = db.query(
        extract('year', Activity.created_at).label('year'),
        extract('month', Activity.created_at).label('month'),
        func.count(Activity.id).label('count')
    ).filter(
        Activity.created_at >= six_months_ago
    ).group_by(
        extract('year', Activity.created_at),
        extract('month', Activity.created_at)
    ).order_by(
        extract('year', Activity.created_at),
        extract('month', Activity.created_at)
    ).all()
    
    monthly_activities = [
        {
            "month": f"{int(year)}-{int(month):02d}",
            "count": count
        }
        for year, month, count in activities_by_month
    ]
    
    # Participări în ultimele 6 luni
    participations_by_month = db.query(
        extract('year', Participation.joined_at).label('year'),
        extract('month', Participation.joined_at).label('month'),
        func.count(Participation.id).label('count')
    ).filter(
        and_(
            Participation.joined_at >= six_months_ago,
            Participation.status == ParticipationStatus.ACCEPTED
        )
    ).group_by(
        extract('year', Participation.joined_at),
        extract('month', Participation.joined_at)
    ).order_by(
        extract('year', Participation.joined_at),
        extract('month', Participation.joined_at)
    ).all()
    
    monthly_participations = [
        {
            "month": f"{int(year)}-{int(month):02d}",
            "count": count
        }
        for year, month, count in participations_by_month
    ]
    
    return {
        "total_activities": total_activities,
        "total_users": total_users,
        "total_participations": total_participations,
        "categories": categories,
        "monthly_activities": monthly_activities,
        "monthly_participations": monthly_participations
    }


@router.get("/personal")
async def get_personal_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Statistici personale pentru utilizatorul curent"""
    
    # Activități create
    created_activities = db.query(func.count(Activity.id)).filter(
        Activity.creator_id == current_user.id
    ).scalar() or 0
    
    # Participări acceptate
    accepted_participations = db.query(func.count(Participation.id)).filter(
        and_(
            Participation.user_id == current_user.id,
            Participation.status == ParticipationStatus.ACCEPTED
        )
    ).scalar() or 0
    
    # Participări în așteptare
    pending_participations = db.query(func.count(Participation.id)).filter(
        and_(
            Participation.user_id == current_user.id,
            Participation.status == ParticipationStatus.PENDING
        )
    ).scalar() or 0
    
    # Activități create pe categorii
    my_categories = db.query(
        Activity.category,
        func.count(Activity.id).label('count')
    ).filter(
        Activity.creator_id == current_user.id
    ).group_by(Activity.category).all()
    
    my_category_stats = [{"name": cat, "count": count} for cat, count in my_categories]
    
    # Activități create în ultimele 6 luni
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    my_activities_by_month = db.query(
        extract('year', Activity.created_at).label('year'),
        extract('month', Activity.created_at).label('month'),
        func.count(Activity.id).label('count')
    ).filter(
        and_(
            Activity.created_at >= six_months_ago,
            Activity.creator_id == current_user.id
        )
    ).group_by(
        extract('year', Activity.created_at),
        extract('month', Activity.created_at)
    ).order_by(
        extract('year', Activity.created_at),
        extract('month', Activity.created_at)
    ).all()
    
    my_monthly_activities = [
        {
            "month": f"{int(year)}-{int(month):02d}",
            "count": count
        }
        for year, month, count in my_activities_by_month
    ]
    
    # Participări în ultimele 6 luni
    my_participations_by_month = db.query(
        extract('year', Participation.joined_at).label('year'),
        extract('month', Participation.joined_at).label('month'),
        func.count(Participation.id).label('count')
    ).filter(
        and_(
            Participation.joined_at >= six_months_ago,
            Participation.user_id == current_user.id,
            Participation.status == ParticipationStatus.ACCEPTED
        )
    ).group_by(
        extract('year', Participation.joined_at),
        extract('month', Participation.joined_at)
    ).order_by(
        extract('year', Participation.joined_at),
        extract('month', Participation.joined_at)
    ).all()
    
    my_monthly_participations = [
        {
            "month": f"{int(year)}-{int(month):02d}",
            "count": count
        }
        for year, month, count in my_participations_by_month
    ]
    
    # Prietenii noi în ultimele 3 luni
    three_months_ago = datetime.utcnow() - timedelta(days=90)
    new_friends = db.query(func.count(FriendRequest.id)).filter(
        and_(
            ((FriendRequest.from_user_id == current_user.id) |
             (FriendRequest.to_user_id == current_user.id)),
            FriendRequest.status == "accepted",
            FriendRequest.created_at >= three_months_ago
        )
    ).scalar() or 0
    
    # Top 5 activități cu cele mai multe participări (create de utilizator)
    top_activities = db.query(
        Activity.id,
        Activity.title,
        Activity.category,
        func.count(Participation.id).label('participants_count')
    ).join(
        Participation, Activity.id == Participation.activity_id
    ).filter(
        and_(
            Activity.creator_id == current_user.id,
            Participation.status == ParticipationStatus.ACCEPTED
        )
    ).group_by(
        Activity.id, Activity.title, Activity.category
    ).order_by(
        func.count(Participation.id).desc()
    ).limit(5).all()
    
    top_activities_list = [
        {
            "id": act.id,
            "title": act.title,
            "category": act.category,
            "participants_count": act.participants_count
        }
        for act in top_activities
    ]
    
    return {
        "created_activities": created_activities,
        "accepted_participations": accepted_participations,
        "pending_participations": pending_participations,
        "categories": my_category_stats,
        "monthly_activities": my_monthly_activities,
        "monthly_participations": my_monthly_participations,
        "new_friends_last_3_months": new_friends,
        "top_activities": top_activities_list
    }


