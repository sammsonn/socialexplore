import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './ActivityDetails.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ActivityDetails = ({ activity, onClose, onUpdate }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [participation, setParticipation] = useState(null);
  const [participations, setParticipations] = useState([]); // Lista de participări (pentru creator)
  const [loading, setLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [loadingParticipations, setLoadingParticipations] = useState(false);
  const { token, user } = useAuth();

  // Stabilizează api cu useMemo pentru a preveni re-crearea la fiecare render
  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: API_URL
    });
    // Interceptor pentru a actualiza token-ul
    instance.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return instance;
  }, [token]);

  const loadMessages = useCallback(async () => {
    try {
      const response = await api.get(`/api/messages/activity/${activity.id}`);
      setMessages(response.data);
    } catch (error) {
      // Dacă eroarea este 403, înseamnă că utilizatorul nu are acces la mesaje
      // (nu este creator sau participant acceptat)
      if (error.response?.status === 403) {
        // Nu logăm ca eroare - este normal dacă utilizatorul nu participă încă
        setMessages([]);
      } else {
        console.error('Eroare la încărcarea mesajelor:', error);
      }
    }
  }, [activity.id, api]);

  const checkParticipation = useCallback(async () => {
    try {
      const response = await api.get('/api/participations/my/activities');
      const myParticipation = response.data.find(p => p.activity_id === activity.id);
      setParticipation(myParticipation);
    } catch (error) {
      console.error('Eroare la verificarea participării:', error);
    }
  }, [activity.id, api]);

  const loadParticipations = useCallback(async () => {
    if (activity.creator_id !== user?.id) return; // Doar creatorul poate vedea participările
    
    setLoadingParticipations(true);
    try {
      const response = await api.get(`/api/participations/activity/${activity.id}`);
      setParticipations(response.data);
    } catch (error) {
      console.error('Eroare la încărcarea participărilor:', error);
    } finally {
      setLoadingParticipations(false);
    }
  }, [activity.id, activity.creator_id, user?.id, api]);

  const handleUpdateParticipation = async (participationId, newStatus) => {
    try {
      await api.put(`/api/participations/${participationId}`, { status: newStatus });
      await loadParticipations(); // Reîncarcă lista
      onUpdate(); // Actualizează activitatea
    } catch (error) {
      console.error('Eroare la actualizarea participării:', error);
    }
  };

  const handleDeleteActivity = async () => {
    setLoading(true);
    try {
      await api.delete(`/api/activities/${activity.id}`);
      onClose(); // Închide modalul
      onUpdate(); // Actualizează lista de activități
    } catch (error) {
      console.error('Eroare la ștergerea activității:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkParticipation();
    if (activity.creator_id === user?.id) {
      loadParticipations(); // Creatorul încarcă lista de participări
    }
    // Nu adăugăm checkParticipation și loadParticipations în dependencies
    // pentru că sunt deja stabilizate cu useCallback și au propriile dependencies
  }, [activity.id, activity.creator_id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Încarcă mesajele doar dacă utilizatorul are acces (creator sau participant acceptat)
  useEffect(() => {
    const isCreator = activity.creator_id === user?.id;
    const canChat = isCreator || (participation && participation.status === 'accepted');
    
    if (canChat) {
      loadMessages();
      // Refresh mesajele la fiecare 5 secunde
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [activity.id, activity.creator_id, user?.id, participation, loadMessages]);

  const handleJoin = async () => {
    setLoading(true);
    try {
      await api.post('/api/participations/', { activity_id: activity.id });
      await checkParticipation();
      onUpdate();
    } catch (error) {
      console.error('Eroare la participare:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setMessageLoading(true);
    try {
      await api.post('/api/messages/', {
        activity_id: activity.id,
        text: newMessage
      });
      setNewMessage('');
      await loadMessages();
    } catch (error) {
      console.error('Eroare la trimiterea mesajului:', error);
    } finally {
      setMessageLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isCreator = activity.creator_id === user?.id;
  const canChat = isCreator || (participation && participation.status === 'accepted');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="activity-details" 
        onClick={(e) => {
          e.stopPropagation();
          console.log('Click pe activity-details');
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="details-header">
          <h2>{activity.title}</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isCreator && (
              <button
                onClick={handleDeleteActivity}
                disabled={loading}
                className="btn-delete"
                title="Șterge activitatea"
              >
                🗑️ Șterge
              </button>
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="details-content">
          <div className="details-section">
            <h3>Informații</h3>
            <p><strong>Categorie:</strong> {activity.category}</p>
            <p><strong>Creator:</strong> {activity.creator_name}</p>
            <p><strong>Data început:</strong> {formatDate(activity.start_time)}</p>
            {activity.end_time && (
              <p><strong>Data sfârșit:</strong> {formatDate(activity.end_time)}</p>
            )}
            <p><strong>Participanți:</strong> {activity.participants_count || 0}
              {activity.max_people ? ` / ${activity.max_people}` : ''}</p>
            {activity.description && (
              <p><strong>Descriere:</strong> {activity.description}</p>
            )}
          </div>

          {!isCreator && (
            <div className="details-section">
              {!participation ? (
                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? 'Se trimite...' : 'Cere să participi'}
                </button>
              ) : (
                <div className="participation-status">
                  <p>Status participare: <strong>{participation.status}</strong></p>
                  {participation.status === 'pending' && (
                    <p className="status-hint">Așteaptă aprobarea creatorului</p>
                  )}
                </div>
              )}
            </div>
          )}

          {isCreator && (
            <div className="details-section">
              <h3>Cereri de participare</h3>
              {loadingParticipations ? (
                <p>Se încarcă...</p>
              ) : participations.length === 0 ? (
                <p>Nu există cereri de participare</p>
              ) : (
                <div className="participations-list">
                  {participations.map(part => (
                    <div key={part.id} className="participation-item">
                      <div className="participation-info">
                        <strong>{part.user_name}</strong>
                        <span className={`status-badge status-${part.status}`}>
                          {part.status === 'pending' && 'În așteptare'}
                          {part.status === 'accepted' && '✓ Acceptat'}
                          {part.status === 'rejected' && '✗ Respins'}
                        </span>
                      </div>
                      {part.status === 'pending' && (
                        <div className="participation-actions">
                          <button
                            onClick={() => handleUpdateParticipation(part.id, 'accepted')}
                            className="btn-accept"
                          >
                            Acceptă
                          </button>
                          <button
                            onClick={() => handleUpdateParticipation(part.id, 'rejected')}
                            className="btn-reject"
                          >
                            Respinge
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canChat && (
            <div className="details-section">
              <h3>Chat</h3>
              <div className="messages-container">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender_id === user?.id ? 'own' : ''}`}
                  >
                    <div className="message-header">
                      <strong>{msg.sender_name}</strong>
                      <span className="message-time">{formatDate(msg.created_at)}</span>
                    </div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="message-form">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Scrie un mesaj..."
                  disabled={messageLoading}
                />
                <button type="submit" disabled={messageLoading || !newMessage.trim()}>
                  Trimite
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityDetails;
