from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# User Schemas
class UserBase(BaseModel):
    name: str
    email: EmailStr
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    visibility_radius_km: Optional[int] = 10


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    visibility_radius_km: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class UserResponse(UserBase):
    id: int
    created_at: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    class Config:
        from_attributes = True


class UserProfileResponse(UserResponse):
    created_activities_count: Optional[int] = 0
    participations_count: Optional[int] = 0
    friends_count: Optional[int] = 0


# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# Activity Schemas
class ActivityBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    start_time: datetime
    end_time: Optional[datetime] = None
    latitude: float
    longitude: float
    max_people: Optional[int] = None
    is_public: bool = True


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_people: Optional[int] = None
    is_public: Optional[bool] = None


class ActivityResponse(ActivityBase):
    id: int
    creator_id: int
    creator_name: Optional[str] = None
    created_at: datetime
    participants_count: Optional[int] = 0
    current_user_participation: Optional[str] = None

    class Config:
        from_attributes = True


class ActivityFilter(BaseModel):
    category: Optional[str] = None
    max_distance_km: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    start_time_after: Optional[datetime] = None
    max_participants: Optional[int] = None


# Participation Schemas
class ParticipationCreate(BaseModel):
    activity_id: int


class ParticipationResponse(BaseModel):
    id: int
    activity_id: int
    user_id: int
    user_name: Optional[str] = None
    status: str
    joined_at: datetime

    class Config:
        from_attributes = True


class ParticipationUpdate(BaseModel):
    status: str  # pending, accepted, rejected


# Friend Request Schemas
class FriendRequestCreate(BaseModel):
    to_user_id: int


class FriendRequestResponse(BaseModel):
    id: int
    from_user_id: int
    from_user_name: Optional[str] = None
    to_user_id: int
    to_user_name: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class FriendRequestUpdate(BaseModel):
    status: str  # accepted, rejected


# Message Schemas
class MessageCreate(BaseModel):
    activity_id: int
    text: str


class MessageResponse(BaseModel):
    id: int
    activity_id: int
    sender_id: int
    sender_name: Optional[str] = None
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


# Search Schemas
class NearbyUsersRequest(BaseModel):
    latitude: float
    longitude: float
    radius_km: Optional[float] = 10
    interests: Optional[List[str]] = None


class NearbyUsersResponse(BaseModel):
    id: int
    name: str
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_km: Optional[float] = None

    class Config:
        from_attributes = True


# Notification Schemas
class NotificationItem(BaseModel):
    id: int
    type: str  # "participation_request", "new_message", "friend_request_received", "friend_request_accepted"
    activity_id: Optional[int] = None  # Opțional pentru notificările de prietenie
    activity_title: Optional[str] = None  # Opțional pentru notificările de prietenie
    user_name: str
    user_id: int
    message: str  # Mesaj descriptiv: "Alex a cerut să se înscrie la evenimentul X" sau "Alex ți-a trimis o cerere de prietenie"
    created_at: datetime


class NotificationsResponse(BaseModel):
    notifications: List[NotificationItem]
    count: int
