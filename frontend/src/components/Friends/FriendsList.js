import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './FriendsList.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const FriendsList = ({ onClose, userLocation, initialTab, onUpdate }) => {
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'friends');
  const [loading, setLoading] = useState(false);
  const { token, user } = useAuth();
  
  // Actualizează tab-ul activ când se schimbă initialTab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Stabilizează instanța axios cu useMemo pentru a preveni infinite loops
  const api = useMemo(() => {
    return axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }, [token]);

  const loadData = useCallback(async () => {
    try {
      const [friendsRes, receivedRes, sentRes] = await Promise.all([
        api.get('/api/friends/'),
        api.get('/api/friends/requests/received'),
        api.get('/api/friends/requests/sent')
      ]);
      setFriends(friendsRes.data);
      setReceivedRequests(receivedRes.data);
      setSentRequests(sentRes.data);
    } catch (error) {
      console.error('Eroare la încărcarea datelor:', error);
    }
  }, [api]);

  // Încarcă datele doar o dată când componenta se montează
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Rulează doar o dată la mount

  const handleAcceptRequest = async (requestId) => {
    setLoading(true);
    try {
      await api.put(`/api/friends/requests/${requestId}`, { status: 'accepted' });
      await loadData();
      // Notifică componenta părinte să reîmprospăteze notificările
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Eroare la acceptarea cererii:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    setLoading(true);
    try {
      await api.put(`/api/friends/requests/${requestId}`, { status: 'rejected' });
      await loadData();
      // Notifică componenta părinte să reîmprospăteze notificările
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Eroare la respingerea cererii:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    setLoading(true);
    try {
      await api.delete(`/api/friends/${friendId}`);
      await loadData();
      // Notifică componenta părinte să reîmprospăteze notificările
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Eroare la ștergerea prietenului:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUsers = async () => {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      console.error('Locația nu este disponibilă:', userLocation);
      return;
    }

    setSearchLoading(true);
    try {
      console.log('Caut utilizatori la:', userLocation.latitude, userLocation.longitude);
      const response = await api.get('/api/search/users/nearby', {
        params: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radius_km: 50 // Caută utilizatori într-o rază de 50 km
        }
      });
      console.log('Rezultate căutare:', response.data);
      setSearchResults(response.data || []);
    } catch (error) {
      console.error('Eroare la căutarea utilizatorilor:', error);
      console.error('Detalii eroare:', error.response?.data);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendFriendRequest = async (toUserId) => {
    setLoading(true);
    try {
      await api.post('/api/friends/requests', { to_user_id: toUserId });
      await loadData(); // Reîncarcă datele pentru a actualiza statusurile
      await handleSearchUsers(); // Reîncarcă rezultatele căutării
    } catch (error) {
      console.error('Eroare la trimiterea cererii de prietenie:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRelationshipStatus = (userId) => {
    // Verifică dacă este prieten
    if (friends.some(f => f.id === userId)) {
      return 'friend';
    }
    // Verifică dacă există cerere trimisă
    if (sentRequests.some(r => r.to_user_id === userId)) {
      return 'sent';
    }
    // Verifică dacă există cerere primită
    if (receivedRequests.some(r => r.from_user_id === userId)) {
      return 'received';
    }
    return 'none';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content friends-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Prieteni</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            Prieteni ({friends.length})
          </button>
          <button
            className={`tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('search');
              if (searchResults.length === 0 && !searchLoading) {
                handleSearchUsers();
              }
            }}
          >
            Caută utilizatori
          </button>
          <button
            className={`tab ${activeTab === 'received' ? 'active' : ''}`}
            onClick={() => setActiveTab('received')}
          >
            Cereri primite ({receivedRequests.length})
          </button>
          <button
            className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            Cereri trimise ({sentRequests.length})
          </button>
        </div>

        <div className="friends-content">
          {activeTab === 'friends' && (
            <div className="friends-list">
              {friends.length === 0 ? (
                <p className="empty-state">Nu ai prieteni încă</p>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="friend-item">
                    <div className="friend-info">
                      <h3>{friend.name}</h3>
                      {friend.bio && <p className="friend-bio">{friend.bio}</p>}
                      {friend.interests && friend.interests.length > 0 && (
                        <div className="friend-interests">
                          {friend.interests.map((interest, idx) => (
                            <span key={idx} className="interest-tag">{interest}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveFriend(friend.id)}
                      disabled={loading}
                      className="btn-remove-friend"
                      title="Șterge prietenul"
                    >
                      🗑️ Șterge
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'received' && (
            <div className="requests-list">
              {receivedRequests.length === 0 ? (
                <p className="empty-state">Nu ai cereri de prietenie primite</p>
              ) : (
                receivedRequests.map(request => (
                  <div key={request.id} className="request-item">
                    <div className="request-info">
                      <h3>{request.from_user_name}</h3>
                      <p className="request-date">
                        {new Date(request.created_at).toLocaleDateString('ro-RO')}
                      </p>
                    </div>
                    <div className="request-actions">
                      <button
                        onClick={() => handleAcceptRequest(request.id)}
                        disabled={loading}
                        className="btn-accept"
                      >
                        Acceptă
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={loading}
                        className="btn-reject"
                      >
                        Respinge
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'sent' && (
            <div className="requests-list">
              {sentRequests.length === 0 ? (
                <p className="empty-state">Nu ai trimis cereri de prietenie</p>
              ) : (
                sentRequests.map(request => (
                  <div key={request.id} className="request-item">
                    <div className="request-info">
                      <h3>{request.to_user_name}</h3>
                      <p className="request-status">În așteptare</p>
                      <p className="request-date">
                        {new Date(request.created_at).toLocaleDateString('ro-RO')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="search-users">
              <div className="search-header">
                <button
                  onClick={handleSearchUsers}
                  disabled={searchLoading || !userLocation}
                  className="btn-primary"
                >
                  {searchLoading ? 'Se caută...' : 'Caută utilizatori în apropiere'}
                </button>
              </div>
              {searchResults.length === 0 && !searchLoading ? (
                <p className="empty-state">Apasă butonul pentru a căuta utilizatori în apropiere</p>
              ) : searchLoading ? (
                <p className="empty-state">Se caută utilizatori...</p>
              ) : (
                <div className="search-results">
                  {searchResults.map(user => {
                    const status = getRelationshipStatus(user.id);
                    return (
                      <div key={user.id} className="user-item">
                        <div className="user-info">
                          <h3>{user.name}</h3>
                          {user.bio && <p className="user-bio">{user.bio}</p>}
                          {user.interests && user.interests.length > 0 && (
                            <div className="user-interests">
                              {user.interests.map((interest, idx) => (
                                <span key={idx} className="interest-tag">{interest}</span>
                              ))}
                            </div>
                          )}
                          {user.distance_km && (
                            <p className="user-distance">
                              📍 {user.distance_km.toFixed(1)} km distanță
                            </p>
                          )}
                        </div>
                        <div className="user-actions">
                          {status === 'friend' && (
                            <span className="status-badge friend">✓ Prieten</span>
                          )}
                          {status === 'sent' && (
                            <span className="status-badge sent">⏳ Cerere trimisă</span>
                          )}
                          {status === 'received' && (
                            <span className="status-badge received">📩 Cerere primită</span>
                          )}
                          {status === 'none' && (
                            <button
                              onClick={() => handleSendFriendRequest(user.id)}
                              disabled={loading}
                              className="btn-primary btn-small"
                            >
                              Trimite cerere
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendsList;
