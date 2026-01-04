![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![Ubuntu](https://img.shields.io/badge/Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)

---
<br>

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Yarn](https://img.shields.io/badge/yarn-%232C8EBB.svg?style=for-the-badge&logo=yarn&logoColor=white)
![Context-API](https://img.shields.io/badge/Context--Api-000000?style=for-the-badge&logo=react)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/css-%23663399.svg?style=for-the-badge&logo=css&logoColor=white)

---

> [!Note]
> There are only two tested browsers: Google Chrome and Opera GX in Windows. Try other browsers at your own risk.

## About The Project

SocialExplore is a full-stack web platform for discovering, creating, and participating in local activities.
It features an interactive map with activity markers, heatmaps, and regional statistics using ArcGIS JS API.

> [!Important]
> Follow the Setup Instructions properly.

## Getting Started

### Prerequisites
* Python 3.10+
* Node.js 18+ (LTS)
* npm / yarn
* Internet connection for ArcGIS

### Installation

  ```sh
    git clone https://github.com/your-username/socialexplore.git
    cd socialexplore
  ```

### Run Docker
    ```sh
    docker compose up --build
    ```

### Backend setup (FastAPI)
    ```sh
    cd backend
    python -m venv venv
    venv\Scripts\activate # Windows
    pip installl -r requirements.txt
    ```

#### Start the backend
    ```sh
        uvicorn main:app --reload
    ```

#### Backend will run at
    ```sh
    http://localhost:8000
    ```

#### Health Check
    ```sh
    http://localhost:8000/api/health
    ```

### Frontend setup (React)
    ```sh
    cd frontend
    npm install
    ```

#### Create ``.env`` file and add the following
    ```
        REACT_APP_ARCGIS_API_KEY=YOUR_KEY
    ```

#### Start the frontend
    ```sh
        npm start
    ```

> [!IMPORTANT]
> Frontend will run at http://localhost:3000 (or 3001)




