import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './NotificationsDropdown.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const NotificationsDropdown = ({ count, onNotificationClick, onNotificationsUpdated }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { token } = useAuth();

  const api = axios.create({
    baseURL: API_URL,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/participations/notifications');
      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.error('Eroare la încărcarea notificărilor:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, count]);

  // Închide dropdown-ul când se face click în afara lui
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notification) => {
    // Marchează notificarea ca citită IMEDIAT
    try {
      console.log('Marchez notificarea ca citită:', notification.type, notification.id);
      await api.post(`/api/participations/notifications/${notification.type}/${notification.id}/read`);
      console.log('Notificare marcată ca citită cu succes');
      
      // Notifică componenta părinte să reîmprospăteze count-ul IMEDIAT (înainte de a reîncărca lista)
      if (onNotificationsUpdated) {
        await onNotificationsUpdated();
        console.log('Count-ul de notificări reîncărcat');
      }
      
      // Reîncarcă notificările pentru a actualiza lista IMEDIAT
      await loadNotifications();
    } catch (error) {
      console.error('Eroare la marcarea notificării ca citită:', error);
    }
    
    // Închide dropdown-ul imediat (înainte de a deschide lista de prieteni/activitate)
    setIsOpen(false);
    
    // Apelează callback-ul pentru a deschide lista de prieteni sau activitatea (după închiderea dropdown-ului)
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
  };

  const handleMarkAllAsRead = async (e) => {
    // Previne propagarea evenimentului pentru a nu închide dropdown-ul
    e.stopPropagation();
    e.preventDefault();
    
    // Marchează toate notificările ca citite
    try {
      console.log('Marchez toate notificările ca citite:', notifications.length);
      
      // Marchează toate notificările în paralel pentru viteză
      const markPromises = notifications.map(notification => 
        api.post(`/api/participations/notifications/${notification.type}/${notification.id}/read`)
          .catch(error => {
            console.error(`Eroare la marcarea notificării ${notification.id}:`, error);
            return null; // Continuă chiar dacă una eșuează
          })
      );
      
      await Promise.all(markPromises);
      console.log('Toate notificările marcate ca citite');
      
      // Notifică componenta părinte să reîmprospăteze count-ul IMEDIAT
      if (onNotificationsUpdated) {
        await onNotificationsUpdated();
        console.log('Count-ul de notificări reîncărcat');
      }
      
      // Reîncarcă notificările pentru a actualiza lista
      await loadNotifications();
      
      console.log('Notificările au fost șterse cu succes');
    } catch (error) {
      console.error('Eroare la marcarea tuturor notificărilor ca citite:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Acum';
    if (diffMins < 60) return `Acum ${diffMins} min`;
    if (diffHours < 24) return `Acum ${diffHours} h`;
    if (diffDays < 7) return `Acum ${diffDays} zile`;
    return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  };

  const getNotificationIcon = (type) => {
    if (type === 'participation_request') return '🤝';
    if (type === 'new_message') return '💬';
    if (type === 'friend_request_received') return '👤';
    if (type === 'friend_request_accepted') return '✅';
    return '🔔';
  };

  return (
    <div className="notifications-container" ref={dropdownRef}>
      <div
        className="notification-badge-clickable"
        onClick={() => setIsOpen(!isOpen)}
        title={`${count} notificări`}
      >
        {count > 99 ? '99+' : count}
      </div>

      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <h3>Notificări ({count})</h3>
            {notifications.length > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={handleMarkAllAsRead}
                onMouseDown={(e) => e.stopPropagation()}
                title="Marchează toate notificările ca citite"
              >
                Șterge toate
              </button>
            )}
          </div>
          <div className="notifications-list">
            {loading ? (
              <div className="notifications-loading">Se încarcă...</div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty">Nu există notificări</div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={`${notification.type}-${notification.id}`}
                  className="notification-item"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-message">
                      {notification.message}
                    </div>
                    <div className="notification-time">
                      {formatDate(notification.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsDropdown;

