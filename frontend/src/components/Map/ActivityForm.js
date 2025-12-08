import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './ActivityForm.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ActivityForm = ({ userLocation, onClose, onActivityCreated, view }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'sport',
    start_time: '',
    end_time: '',
    max_people: '',
    is_public: true
  });
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationInitialized, setLocationInitialized] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();

  // Setează locația inițială o singură dată când formularul se deschide
  useEffect(() => {
    if (userLocation && !locationInitialized) {
      console.log('Setez locația inițială la:', userLocation.latitude, userLocation.longitude);
      setSelectedLocation({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude
      });
      setLocationInitialized(true);
    }
  }, [userLocation, locationInitialized]);

  // Setează callback-ul pentru click pe hartă - rulează la fiecare render pentru a fi sigur că este setat
  useEffect(() => {
    // Callback pentru click pe hartă
    window.setActivityLocation = (lat, lng) => {
      console.log('✓✓✓ setActivityLocation apelat cu:', lat, lng);
      setSelectedLocation({ latitude: lat, longitude: lng });
      setLocationInitialized(true); // Marchează că locația a fost selectată manual
      setError(''); // Șterge eroarea dacă există
    };

    return () => {
      delete window.setActivityLocation;
    };
  }); // Rulează la fiecare render pentru a fi sigur că callback-ul este setat

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedLocation) {
      setError('Te rog selectează o locație pe hartă');
      return;
    }

    if (!formData.title || !formData.start_time) {
      setError('Titlul și data de început sunt obligatorii');
      return;
    }

    // Validează că data finală nu este înainte de data inițială
    if (formData.end_time && formData.start_time) {
      const startDate = new Date(formData.start_time);
      const endDate = new Date(formData.end_time);
      if (endDate < startDate) {
        setError('Data finală nu poate fi înainte de data inițială');
        return;
      }
    }

    setLoading(true);

    try {
      const activityData = {
        ...formData,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        start_time: new Date(formData.start_time).toISOString(),
        end_time: formData.end_time ? new Date(formData.end_time).toISOString() : null,
        max_people: formData.max_people ? parseInt(formData.max_people) : null
      };

      await axios.post(
        `${API_URL}/api/activities/`,
        activityData,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // Resetează formularul și locația pentru următoarea utilizare
      setFormData({
        title: '',
        description: '',
        category: 'sport',
        start_time: '',
        end_time: '',
        max_people: '',
        is_public: true
      });
      setSelectedLocation(null);
      setLocationInitialized(false);
      
      onActivityCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Eroare la crearea activității');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{ pointerEvents: 'none' }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="modal-header">
          <h2>Creează Activitate Nouă</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="activity-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Titlu *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="ex: Mers la alergat în parc"
            />
          </div>

          <div className="form-group">
            <label>Descriere</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Descriere activitate..."
            />
          </div>

          <div className="form-group">
            <label>Categorie *</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="sport">Sport</option>
              <option value="food">Mâncare</option>
              <option value="games">Jocuri</option>
              <option value="volunteer">Voluntariat</option>
              <option value="other">Altele</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Data și ora început *</label>
              <input
                type="datetime-local"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                required
              />
            </div>

                <div className="form-group">
                  <label>Data și ora sfârșit</label>
                  <input
                    type="datetime-local"
                    name="end_time"
                    value={formData.end_time}
                    onChange={handleChange}
                    min={formData.start_time || ''}
                  />
                </div>
          </div>

          <div className="form-group">
            <label>Număr maxim participanți</label>
            <input
              type="number"
              name="max_people"
              value={formData.max_people}
              onChange={handleChange}
              min="1"
              placeholder="Nelimitat"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_public"
                checked={formData.is_public}
                onChange={handleChange}
              />
              Activitate publică
            </label>
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
              {loading ? 'Se creează...' : 'Creează Activitate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ActivityForm;

