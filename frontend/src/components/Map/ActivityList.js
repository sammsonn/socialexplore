import React from 'react';
import './ActivityList.css';

const ActivityList = ({ activities, onActivitySelect, selectedActivity }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'sport': '⚽',
      'food': '🍕',
      'games': '🎮',
      'volunteer': '🤝',
      'other': '📍'
    };
    return icons[category] || '📍';
  };

  return (
    <div className="activity-list">
      <h2>Activități ({activities.length})</h2>
      <div className="activities-container">
        {activities.length === 0 ? (
          <p className="no-activities">Nu există activități în apropiere</p>
        ) : (
          activities.map(activity => (
            <div
              key={activity.id}
              className={`activity-item ${selectedActivity?.id === activity.id ? 'selected' : ''}`}
              onClick={() => onActivitySelect(activity)}
            >
              <div className="activity-header">
                <span className="activity-icon">{getCategoryIcon(activity.category)}</span>
                <h3>{activity.title}</h3>
              </div>
              <div className="activity-info">
                <p className="activity-category">{activity.category}</p>
                <p className="activity-creator">Creat de {activity.creator_name}</p>
                <p className="activity-time">{formatDate(activity.start_time)}</p>
                <p className="activity-participants">
                  {activity.participants_count || 0}
                  {activity.max_people ? ` / ${activity.max_people}` : ''} participanți
                </p>
                {activity.current_user_participation && (
                  <span className={`participation-badge participation-badge-${activity.current_user_participation}`}>
                    {activity.current_user_participation === 'accepted' && '✓ Participi'}
                    {activity.current_user_participation === 'pending' && '⏳ În așteptare'}
                    {activity.current_user_participation === 'rejected' && '✗ Respins'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityList;

