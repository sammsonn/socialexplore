from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, users, activities, participations, friends, messages, search

# Creează tabelele în baza de date
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SocialExplore API",
    description="API pentru platforma SocialExplore - conectare persoane și organizare activități locale",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include router-ele
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(participations.router, prefix="/api/participations", tags=["participations"])
app.include_router(friends.router, prefix="/api/friends", tags=["friends"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])
app.include_router(search.router, prefix="/api/search", tags=["search"])


@app.get("/")
async def root():
    return {
        "message": "SocialExplore API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

