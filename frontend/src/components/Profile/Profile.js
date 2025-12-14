import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './Profile.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const Profile = ({ onClose, onUpdate }) => {
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    interests: [],
    visibility_radius_km: 10,
    latitude: null,
    longitude: null
  });
  const [newInterest, setNewInterest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { token, refreshUser } = useAuth();

  // Stabilizează instanța axios cu useMemo pentru a preveni infinite loops
  const api = useMemo(() => {
    return axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }, [token]);

  const loadProfile = useCallback(async () => {
    try {
      const response = await api.get('/api/users/me');
      setProfile(response.data);
      setFormData({
        name: response.data.name,
        bio: response.data.bio || '',
        interests: response.data.interests || [],
        visibility_radius_km: response.data.visibility_radius_km || 10,
        latitude: response.data.latitude,
        longitude: response.data.longitude
      });
    } catch (error) {
      console.error('Eroare la încărcarea profilului:', error);
    }
  }, [api]);

  // Încarcă profilul doar o dată când componenta se montează
  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Rulează doar o dată la mount

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'visibility_radius_km' ? parseInt(value) : value
    }));
  };

  const handleAddInterest = (e) => {
    e?.preventDefault(); // Previne submit-ul formularului dacă este apelat din buton
    const trimmedInterest = newInterest.trim();
    if (trimmedInterest && !formData.interests.includes(trimmedInterest)) {
      setFormData(prev => ({
        ...prev,
        interests: [...prev.interests, trimmedInterest]
      }));
      setNewInterest('');
    } else if (trimmedInterest && formData.interests.includes(trimmedInterest)) {
      // Interesul există deja - nu facem nimic
      console.log('Interesul există deja:', trimmedInterest);
    }
  };

  const handleRemoveInterest = (interest) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.filter(i => i !== interest)
    }));
  };

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationInitialized, setLocationInitialized] = useState(false);

  // Setează locația inițială o singură dată când formularul se deschide
  useEffect(() => {
    if (formData.latitude && formData.longitude && !locationInitialized) {
      console.log('Setez locația inițială la:', formData.latitude, formData.longitude);
      setSelectedLocation({
        latitude: formData.latitude,
        longitude: formData.longitude
      });
      setLocationInitialized(true);
    }
  }, [formData.latitude, formData.longitude, locationInitialized]);

  // Setează callback-ul pentru click pe hartă - rulează la fiecare render pentru a fi sigur că este setat
  useEffect(() => {
    // Callback pentru click pe hartă
    window.setProfileLocation = (lat, lng) => {
      console.log('✓✓✓ setProfileLocation apelat cu:', lat, lng);
      setSelectedLocation({ latitude: lat, longitude: lng });
      setLocationInitialized(true); // Marchează că locația a fost selectată manual
      setError(''); // Șterge eroarea dacă există
    };

    return () => {
      delete window.setProfileLocation;
    };
  }); // Rulează la fiecare render pentru a fi sigur că callback-ul este setat

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Pregătește datele pentru trimitere - folosește selectedLocation dacă există
    const locationToUse = selectedLocation || (formData.latitude && formData.longitude ? { latitude: formData.latitude, longitude: formData.longitude } : null);
    
    const dataToSend = {
      name: formData.name || undefined,
      bio: formData.bio || undefined,
      interests: formData.interests && formData.interests.length > 0 ? formData.interests : undefined,
      visibility_radius_km: formData.visibility_radius_km || undefined,
      latitude: locationToUse?.latitude || undefined,
      longitude: locationToUse?.longitude || undefined
    };

    // Elimină câmpurile undefined pentru a nu le trimite
    Object.keys(dataToSend).forEach(key => {
      if (dataToSend[key] === undefined || dataToSend[key] === null) {
        delete dataToSend[key];
      }
    });

    console.log('📝 Trimitem datele profilului:', dataToSend);
    console.log('📝 FormData original:', formData);

    try {
      const response = await api.put('/api/users/me', dataToSend);
      console.log('✅ Răspuns de la backend:', response.data);
      
      // Reîncarcă profilul pentru a obține datele actualizate
      await loadProfile();
      console.log('✅ Profil reîncărcat');
      
      // Actualizează utilizatorul în AuthContext pentru a actualiza numele în header
      if (refreshUser) {
        try {
          await refreshUser();
          console.log('✅ Utilizator actualizat în context');
        } catch (refreshError) {
          console.warn('⚠️ Nu s-a putut actualiza utilizatorul în context:', refreshError);
          // Nu aruncăm eroarea - profilul s-a actualizat cu succes, doar header-ul nu s-a actualizat
        }
      }
      onUpdate();
      onClose(); // Închide formularul după salvare
    } catch (error) {
      console.error('❌ Eroare la actualizarea profilului:', error);
      console.error('❌ Detalii eroare:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      if (error.response?.status === 401) {
        setError('Sesiunea a expirat. Te rog reconectează-te.');
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Eroare la actualizarea profilului';
        setError(errorMessage);
        console.error('❌ Mesaj eroare afișat utilizatorului:', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <p>Se încarcă...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{ pointerEvents: 'none' }}
    >
      <div 
        className="modal-content profile-modal" 
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="modal-header">
          <h2>Profil Utilizator</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="profile-form">
          {error && <div className="error-message">{error}</div>}

          <div className="profile-stats">
            <div className="stat-item">
              <strong>{profile.created_activities_count || 0}</strong>
              <span>Activități create</span>
            </div>
            <div className="stat-item">
              <strong>{profile.participations_count || 0}</strong>
              <span>Participări</span>
            </div>
            <div className="stat-item">
              <strong>{profile.friends_count || 0}</strong>
              <span>Prieteni</span>
            </div>
          </div>

          <div className="form-group">
            <label>Nume *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Bio</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              rows="3"
              placeholder="Despre tine..."
            />
          </div>

          <div className="form-group">
            <label>Interese</label>
            <div className="interests-input">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddInterest())}
                placeholder="Adaugă un interes..."
              />
              <button type="button" onClick={handleAddInterest} className="btn-add">
                +
              </button>
            </div>
            <div className="interests-list">
              {formData.interests.map((interest, index) => (
                <span key={index} className="interest-tag">
                  {interest}
                  <button
                    type="button"
                    onClick={() => handleRemoveInterest(interest)}
                    className="remove-interest"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Rază de vizibilitate (km)</label>
            <input
              type="number"
              name="visibility_radius_km"
              value={formData.visibility_radius_km}
              onChange={handleChange}
              min="1"
              max="1000"
              step="1"
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>
              Distanța maximă la care alți utilizatori te pot găsi (1-1000 km)
            </small>
          </div>

          <div className="form-group">
            <label>Locație *</label>
            {selectedLocation ? (
              <div className="location-info">
                <p style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                  ✓ Locație selectată: Lat {selectedLocation.latitude.toFixed(6)}, Lng {selectedLocation.longitude.toFixed(6)}
                </p>
                <p className="location-hint" style={{ color: '#667eea', fontSize: '0.9em', fontWeight: 'bold', marginTop: '10px' }}>
                  💡 Click o singură dată PE HARTĂ (în spatele acestui formular) pentru a schimba locația!
                </p>
                <p className="location-hint" style={{ color: '#666', fontSize: '0.85em', marginTop: '5px' }}>
                  Formularul permite click-uri pe hartă - fă click direct pe hartă, nu pe formular
                </p>
              </div>
            ) : (
              <div>
                <p className="location-hint" style={{ color: '#f44336', fontWeight: 'bold' }}>
                  ⚠ Te rog selectează o locație pe hartă
                </p>
                <p className="location-hint" style={{ color: '#667eea', fontSize: '0.9em', fontWeight: 'bold', marginTop: '10px' }}>
                  💡 Click o singură dată PE HARTĂ (în spatele acestui formular)!
                </p>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Anulează
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
