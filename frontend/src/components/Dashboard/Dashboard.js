import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Dashboard = ({ onClose }) => {
  const [generalStats, setGeneralStats] = useState(null);
  const [personalStats, setPersonalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();

  // Stabilizează api cu useMemo
  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: API_URL
    });
    instance.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return instance;
  }, [token]);

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [generalResponse, personalResponse] = await Promise.all([
        api.get('/api/statistics/general'),
        api.get('/api/statistics/personal')
      ]);
      setGeneralStats(generalResponse.data);
      setPersonalStats(personalResponse.data);
    } catch (err) {
      console.error('Eroare la încărcarea statisticilor:', err);
      setError('Eroare la încărcarea statisticilor');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>📊 Dashboard</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="dashboard-loading">Se încarcă statisticile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>📊 Dashboard</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="dashboard-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>📊 Dashboard</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      <div className="dashboard-content">
        {/* Statistici generale */}
        <section className="dashboard-section">
          <h3>Statistici Generale</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{generalStats?.total_activities || 0}</div>
              <div className="stat-label">Total Activități</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{generalStats?.total_users || 0}</div>
              <div className="stat-label">Total Utilizatori</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{generalStats?.total_participations || 0}</div>
              <div className="stat-label">Total Participări</div>
            </div>
          </div>

          {/* Grafic categorii */}
          {generalStats?.categories && generalStats.categories.length > 0 && (
            <div className="chart-container">
              <h4>Distribuție Activități pe Categorii</h4>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={generalStats.categories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {generalStats.categories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grafic evoluție activități */}
          {generalStats?.monthly_activities && generalStats.monthly_activities.length > 0 && (
            <div className="chart-container">
              <h4>Evoluție Activități Create (Ultimele 6 Luni)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={generalStats.monthly_activities}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} name="Activități" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grafic evoluție participări */}
          {generalStats?.monthly_participations && generalStats.monthly_participations.length > 0 && (
            <div className="chart-container">
              <h4>Evoluție Participări (Ultimele 6 Luni)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={generalStats.monthly_participations}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#82ca9d" name="Participări" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Statistici personale */}
        <section className="dashboard-section">
          <h3>Statistici Personale</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{personalStats?.created_activities || 0}</div>
              <div className="stat-label">Activități Create</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{personalStats?.accepted_participations || 0}</div>
              <div className="stat-label">Participări Acceptate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{personalStats?.pending_participations || 0}</div>
              <div className="stat-label">Participări în Așteptare</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{personalStats?.new_friends_last_3_months || 0}</div>
              <div className="stat-label">Prieteni Noi (3 Luni)</div>
            </div>
          </div>

          {/* Grafic categorii personale */}
          {personalStats?.categories && personalStats.categories.length > 0 && (
            <div className="chart-container">
              <h4>Activitățile Mele pe Categorii</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={personalStats.categories}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#0088FE" name="Număr Activități" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grafic evoluție activități personale */}
          {personalStats?.monthly_activities && personalStats.monthly_activities.length > 0 && (
            <div className="chart-container">
              <h4>Evoluția Activităților Mele (Ultimele 6 Luni)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={personalStats.monthly_activities}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#0088FE" strokeWidth={2} name="Activități Create" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grafic evoluție participări personale */}
          {personalStats?.monthly_participations && personalStats.monthly_participations.length > 0 && (
            <div className="chart-container">
              <h4>Evoluția Participărilor Mele (Ultimele 6 Luni)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={personalStats.monthly_participations}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#00C49F" name="Participări" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top activități */}
          {personalStats?.top_activities && personalStats.top_activities.length > 0 && (
            <div className="chart-container">
              <h4>Top 5 Activități cu Cele Mai Multe Participări</h4>
              <div className="top-activities-list">
                {personalStats.top_activities.map((activity, index) => (
                  <div key={activity.id} className="top-activity-item">
                    <span className="top-activity-rank">#{index + 1}</span>
                    <div className="top-activity-info">
                      <div className="top-activity-title">{activity.title}</div>
                      <div className="top-activity-meta">
                        <span className="top-activity-category">{activity.category}</span>
                        <span className="top-activity-count">{activity.participants_count} participanți</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;


