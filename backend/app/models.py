from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSON
from geoalchemy2 import Geometry
from datetime import datetime
import enum
from app.database import Base


class ParticipationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class FriendRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    bio = Column(Text, nullable=True)
    interests = Column(JSON, nullable=True)  # Listă de interese
    home_location = Column(Geometry('POINT', srid=4326), nullable=True)  # PostGIS Point
    visibility_radius_km = Column(Integer, default=10)  # Raza de vizibilitate în km
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    created_activities = relationship("Activity", back_populates="creator", foreign_keys="Activity.creator_id")
    participations = relationship("Participation", back_populates="user")
    sent_friend_requests = relationship("FriendRequest", foreign_keys="FriendRequest.from_user_id", back_populates="from_user")
    received_friend_requests = relationship("FriendRequest", foreign_keys="FriendRequest.to_user_id", back_populates="to_user")
    sent_messages = relationship("Message", back_populates="sender")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False)  # sport, food, games, volunteer, etc.
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    location = Column(Geometry('POINT', srid=4326), nullable=False)  # PostGIS Point
    max_people = Column(Integer, nullable=True)
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    creator = relationship("User", back_populates="created_activities", foreign_keys=[creator_id])
    participations = relationship("Participation", back_populates="activity", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="activity", cascade="all, delete-orphan")


class Participation(Base):
    __tablename__ = "participations"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SQLEnum(ParticipationStatus), default=ParticipationStatus.PENDING)
    joined_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    activity = relationship("Activity", back_populates="participations")
    user = relationship("User", back_populates="participations")


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SQLEnum(FriendRequestStatus), default=FriendRequestStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    from_user = relationship("User", foreign_keys=[from_user_id], back_populates="sent_friend_requests")
    to_user = relationship("User", foreign_keys=[to_user_id], back_populates="received_friend_requests")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    activity = relationship("Activity", back_populates="messages")
    sender = relationship("User", back_populates="sent_messages")


class ReadNotification(Base):
    __tablename__ = "read_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    notification_type = Column(String, nullable=False)  # "participation_request", "new_message", "friend_request_received", "friend_request_accepted"
    notification_id = Column(Integer, nullable=False)  # ID-ul participării, mesajului sau cererii de prietenie
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)  # Opțional pentru notificările de prietenie
    friend_request_id = Column(Integer, ForeignKey("friend_requests.id"), nullable=True)  # Opțional pentru notificările de prietenie
    read_at = Column(DateTime, default=datetime.utcnow)

    # Relații
    friend_request = relationship("FriendRequest", foreign_keys=[friend_request_id])

    # Index compus pentru căutare rapidă
    __table_args__ = (
        {'extend_existing': True},
    )

