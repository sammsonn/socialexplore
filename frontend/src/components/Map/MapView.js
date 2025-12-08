import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import PopupTemplate from '@arcgis/core/PopupTemplate';
import axios from 'axios';
import './MapView.css';
import { useAuth } from '../../context/AuthContext';
import ActivityList from './ActivityList';
import ActivityForm from './ActivityForm';
import Profile from '../Profile/Profile';
import FriendsList from '../Friends/FriendsList';
import ActivityDetails from './ActivityDetails';
import NotificationsDropdown from '../Notifications/NotificationsDropdown';
import '@arcgis/core/assets/esri/themes/light/main.css';

const ARCGIS_API_KEY = process.env.REACT_APP_ARCGIS_API_KEY;
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const MapViewComponent = () => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const activitiesLayerRef = useRef(null);
  const userLocationLayerRef = useRef(null);
  const selectedLocationLayerRef = useRef(null); // Layer separat pentru marker-ul de selecție
  const isMountedRef = useRef(true);
  const initRef = useRef(false); // Previne multiple inițializări
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [friendsListTab, setFriendsListTab] = useState('friends');
  const [filters, setFilters] = useState({
    category: '',
    maxDistance: 10,
    showNearby: true
  });
  const [userLocation, setUserLocation] = useState(null);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [notificationsUpdateKey, setNotificationsUpdateKey] = useState(0);
  const { user, token, logout } = useAuth();

  // Configurare axios cu token (stabilizat cu useMemo)
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

  const getCategoryColor = (category) => {
    const colors = {
      'sport': [255, 0, 0, 1],
      'food': [255, 165, 0, 1],
      'games': [0, 255, 0, 1],
      'volunteer': [0, 0, 255, 1],
      'other': [128, 128, 128, 1]
    };
    return colors[category] || colors['other'];
  };

  const updateMapMarkers = useCallback((activitiesData) => {
    if (!activitiesLayerRef.current || !viewRef.current) return;

    // Șterge marker-ele existente
    try {
      activitiesLayerRef.current.removeAll();
    } catch (error) {
      console.warn('Eroare la ștergerea markerelor:', error);
    }

    // Adaugă marker-e noi
    activitiesData.forEach(activity => {
      try {
        const marker = new Graphic({
          geometry: new Point({
            longitude: activity.longitude,
            latitude: activity.latitude
          }),
          symbol: new SimpleMarkerSymbol({
            color: getCategoryColor(activity.category),
            outline: {
              color: [255, 255, 255, 1],
              width: 2
            },
            size: 16
          }),
          attributes: activity,
          popupTemplate: new PopupTemplate({
            title: activity.title,
            content: `
              <div>
                <p><strong>Categorie:</strong> ${activity.category}</p>
                <p><strong>Creator:</strong> ${activity.creator_name || 'Necunoscut'}</p>
                <p><strong>Participanți:</strong> ${activity.participants_count || 0}${activity.max_people ? ` / ${activity.max_people}` : ''}</p>
                <p><strong>Data:</strong> ${new Date(activity.start_time).toLocaleString('ro-RO')}</p>
                ${activity.description ? `<p>${activity.description}</p>` : ''}
              </div>
            `
          })
        });

        activitiesLayerRef.current.add(marker);
      } catch (error) {
        console.warn('Eroare la adăugarea markerului:', error);
      }
    });
  }, []);

  const loadActivities = useCallback(async () => {
    if (!userLocation) return;
    
    try {
      let url = '/api/activities/nearby';
      // Validează și convertește maxDistance la număr
      const maxDistance = Number(filters.maxDistance);
      const validMaxDistance = (isNaN(maxDistance) || maxDistance <= 0) ? 10 : maxDistance;
      
      const params = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        radius_km: validMaxDistance
      };
      if (filters.category) {
        params.category = filters.category;
      }

      const response = await api.get(url, { params });
      setActivities(response.data);
      // Actualizează marker-ele doar cu activitățile filtrate
      updateMapMarkers(response.data);
    } catch (error) {
      console.error('Eroare la încărcarea activităților:', error);
    }
  }, [userLocation, filters, api, updateMapMarkers]);

  // Încarcă numărul de notificări
  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get('/api/participations/notifications/count');
      const newCount = response.data.count || 0;
      console.log('Notificări count actualizat:', newCount);
      setNotificationsCount(newCount);
    } catch (error) {
      console.error('Eroare la încărcarea notificărilor:', error);
      setNotificationsCount(0);
    }
  }, [api]);

  // Handler pentru click pe notificare
  const handleNotificationClick = useCallback((notification) => {
    console.log('Click pe notificare:', notification);
    
    // Pentru notificările de prietenie, deschide lista de prieteni
    if (notification.type === 'friend_request_received' || notification.type === 'friend_request_accepted') {
      setShowFriends(true);
      // Dacă este cerere primită, deschide tab-ul "Cereri primite"
      // Dacă este acceptare, deschide tab-ul "Prieteni"
      // Acest lucru va fi gestionat în FriendsList
    }
    // Pentru notificările de participare sau mesaje, poți adăuga logică aici dacă e nevoie
  }, []);

  // Inițializare hartă (doar o dată la mount)
  useEffect(() => {
    if (!mapDiv.current) {
      console.warn('mapDiv.current este null');
      return;
    }
    
    if (viewRef.current || initRef.current) {
      console.log('Harta deja inițializată sau în proces de inițializare');
      return; // Previne double initialization
    }

    console.log('Începe inițializarea hărții...');
    console.log('ARCGIS_API_KEY:', ARCGIS_API_KEY ? 'Setat' : 'LIPSĂ!');
    console.log('Container dimensiuni:', mapDiv.current.offsetWidth, 'x', mapDiv.current.offsetHeight);

    initRef.current = true;
    isMountedRef.current = true;
    let view = null;
    let map = null;

    try {
      // Configurează API key-ul ArcGIS
      if (ARCGIS_API_KEY) {
        esriConfig.apiKey = ARCGIS_API_KEY;
        console.log('API Key ArcGIS configurat:', ARCGIS_API_KEY.substring(0, 20) + '...');
      } else {
        console.error('ARCGIS_API_KEY nu este setat! Harta nu va funcționa fără API key.');
        // Încearcă să folosească harta fără API key (limitări)
        console.warn('Încercare fără API key - funcționalități limitate');
      }

      // Creează hartă
      // Folosim 'streets' sau 'satellite' dacă 'arcgis-topographic' nu funcționează
      map = new Map({
        basemap: 'streets' // Schimbat de la 'arcgis-topographic' la 'streets' pentru compatibilitate mai bună
      });

      // Creează view-ul hărții
      view = new MapView({
        container: mapDiv.current,
        map: map,
        center: [26.1025, 44.4268], // București (default)
        zoom: 13
      });

      viewRef.current = view;
      console.log('MapView creat cu succes');

      // Layer pentru activități
      const activitiesLayer = new GraphicsLayer();
      map.add(activitiesLayer);
      activitiesLayerRef.current = activitiesLayer;

      // Layer pentru locația utilizatorului
      const userLocationLayer = new GraphicsLayer();
      map.add(userLocationLayer);
      userLocationLayerRef.current = userLocationLayer;

      // Layer separat pentru marker-ul de selecție locație (când se creează activitate)
      const selectedLocationLayer = new GraphicsLayer();
      map.add(selectedLocationLayer);
      selectedLocationLayerRef.current = selectedLocationLayer;
      
      // Handler pentru click pe marker-ele activităților (doar când formularul NU este deschis)
      // Acest handler va fi gestionat separat în useEffect pentru showActivityForm

      // Obține locația utilizatorului
      view.when(() => {
        console.log('MapView inițializat cu succes');
        console.log('View ready, basemap:', map.basemap);
        
        // Verifică dacă basemap-ul s-a încărcat (doar dacă există basemapLayers)
        if (map.basemapLayers && map.basemapLayers.length > 0) {
          view.whenLayerView(map.basemapLayers.getItemAt(0)).then(() => {
            console.log('Basemap layer încărcat cu succes');
          }).catch((err) => {
            console.warn('Eroare la încărcarea basemap-ului:', err);
          });
        } else {
          console.warn('Basemap layers nu sunt disponibile, dar harta ar trebui să funcționeze');
        }
        
        if (!isMountedRef.current) return; // Verifică dacă componenta este încă montată
        
        // Folosește home_location din profil dacă este disponibil, altfel folosește GPS
        const loadUserLocation = async () => {
          try {
            // Încearcă să obțină home_location din profil
            const profileResponse = await api.get('/api/users/me');
            const profile = profileResponse.data;
            
            if (profile.latitude && profile.longitude) {
              // Folosește home_location din profil
              const longitude = profile.longitude;
              const latitude = profile.latitude;
              
              if (!isMountedRef.current) return;
              
              setUserLocation({ longitude, latitude });
              view.goTo({
                center: [longitude, latitude],
                zoom: 14
              }).catch(() => {});

              // Adaugă marker pentru locația utilizatorului (home_location)
              const userLocationGraphic = new Graphic({
                geometry: new Point({
                  longitude: longitude,
                  latitude: latitude
                }),
                symbol: new SimpleMarkerSymbol({
                  color: [0, 120, 255, 1],
                  outline: {
                    color: [255, 255, 255, 1],
                    width: 2
                  },
                  size: 12
                })
              });

              if (userLocationLayerRef.current) {
                userLocationLayer.add(userLocationGraphic);
              }
            } else {
              // Fallback la GPS dacă nu există home_location
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  if (!isMountedRef.current) return;
                  
                  const { longitude, latitude } = position.coords;
                  setUserLocation({ longitude, latitude });
                  view.goTo({
                    center: [longitude, latitude],
                    zoom: 14
                  }).catch(() => {});

                  // Adaugă marker pentru locația utilizatorului
                  const userLocationGraphic = new Graphic({
                    geometry: new Point({
                      longitude: longitude,
                      latitude: latitude
                    }),
                    symbol: new SimpleMarkerSymbol({
                      color: [0, 120, 255, 1],
                      outline: {
                        color: [255, 255, 255, 1],
                        width: 2
                      },
                      size: 12
                    })
                  });

                  if (userLocationLayerRef.current) {
                    userLocationLayer.add(userLocationGraphic);
                  }
                },
                (error) => {
                  console.warn('Nu s-a putut obține locația:', error);
                }
              );
            }
          } catch (error) {
            console.warn('Eroare la încărcarea profilului, folosesc GPS:', error);
            // Fallback la GPS dacă nu se poate încărca profilul
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!isMountedRef.current) return;
                
                const { longitude, latitude } = position.coords;
                setUserLocation({ longitude, latitude });
                view.goTo({
                  center: [longitude, latitude],
                  zoom: 14
                }).catch(() => {});

                // Adaugă marker pentru locația utilizatorului
                const userLocationGraphic = new Graphic({
                  geometry: new Point({
                    longitude: longitude,
                    latitude: latitude
                  }),
                  symbol: new SimpleMarkerSymbol({
                    color: [0, 120, 255, 1],
                    outline: {
                      color: [255, 255, 255, 1],
                      width: 2
                    },
                    size: 12
                  })
                });

                if (userLocationLayerRef.current) {
                  userLocationLayer.add(userLocationGraphic);
                }
              },
              (error) => {
                console.warn('Nu s-a putut obține locația:', error);
              }
            );
          }
        };
        
        loadUserLocation();

        if (isMountedRef.current) {
          setMapLoaded(true);
        }
      }).catch((error) => {
        console.error('Eroare la inițializarea hărții:', error);
        if (isMountedRef.current) {
          setMapLoaded(true); // Setăm totuși ca încărcat pentru a nu bloca UI-ul
        }
      });
    } catch (error) {
      console.error('Eroare la inițializarea hărții:', error);
      if (isMountedRef.current) {
        setMapLoaded(true); // Setăm totuși ca încărcat pentru a nu bloca UI-ul
      }
    }

    // Cleanup
    return () => {
      isMountedRef.current = false;
      
      // Nu distruge view-ul imediat - lasă-l să fie distrus de browser
      // când container-ul este eliminat din DOM
      const view = viewRef.current;
      if (view) {
        // Marchează view-ul ca fiind în proces de distrugere
        viewRef.current = null;
        
        // Distruge view-ul doar dacă container-ul există încă
        if (view.container && view.container.parentNode && !view.destroyed) {
          try {
            // Distruge view-ul - removeAll() poate cauza probleme
            view.destroy();
          } catch (error) {
            // Ignoră erorile - view-ul poate fi deja distrus
            // Nu logăm eroarea pentru a nu polua consola
          }
        }
      }
      
      activitiesLayerRef.current = null;
      userLocationLayerRef.current = null;
      selectedLocationLayerRef.current = null;
    };
  }, []); // Rulează doar o dată la mount

  // Gestionare click handler pentru formular (separat)
  useEffect(() => {
    if (!viewRef.current) return;

    let clickHandler = null;

    if (showActivityForm || showProfile) {
      // Așteaptă puțin pentru ca ActivityForm să seteze window.setActivityLocation
      const setupClickHandler = () => {
        console.log('Click handler activat pentru selectare locație');
        console.log('window.setActivityLocation există?', typeof window.setActivityLocation);
        console.log('window.setProfileLocation există?', typeof window.setProfileLocation);
        
        // Click pe hartă pentru a selecta locație (când formularul este deschis)
        // NU folosim stopPropagation pentru a permite pan și zoom pe hartă
        clickHandler = viewRef.current.on('click', (event) => {
          const { longitude, latitude } = event.mapPoint;
          console.log('🖱️ Click detectat pe hartă! Coordonate:', latitude, longitude);
          
          // Adaugă marker vizual imediat
          if (selectedLocationLayerRef.current) {
            try {
              // Șterge marker-ul anterior (dacă există)
              selectedLocationLayerRef.current.removeAll();
              
              // Adaugă marker nou la locația selectată
              const locationMarker = new Graphic({
                geometry: new Point({
                  longitude: longitude,
                  latitude: latitude
                }),
                symbol: new SimpleMarkerSymbol({
                  color: [255, 0, 0, 0.8], // Roșu pentru locația selectată
                  outline: {
                    color: [255, 255, 255, 1],
                    width: 3
                  },
                  size: 20
                })
              });
              
              selectedLocationLayerRef.current.add(locationMarker);
              console.log('✓✓✓ Marker roșu adăugat pe hartă la:', latitude, longitude);
            } catch (error) {
              console.error('Eroare la adăugarea markerului:', error);
            }
          }
          
          // Trimite coordonatele la formular (prin callback) - reîncearcă de mai multe ori
          const trySetLocation = (attempt = 1) => {
            // Încearcă pentru ActivityForm
            if (showActivityForm && window.setActivityLocation && typeof window.setActivityLocation === 'function') {
              try {
                window.setActivityLocation(latitude, longitude);
                console.log('✓✓✓✓✓ Locație trimisă la ActivityForm (încercarea', attempt, '):', latitude, longitude);
                return;
              } catch (error) {
                console.error('Eroare la apelarea setActivityLocation:', error);
              }
            }
            
            // Încearcă pentru Profile
            if (showProfile && window.setProfileLocation && typeof window.setProfileLocation === 'function') {
              try {
                window.setProfileLocation(latitude, longitude);
                console.log('✓✓✓✓✓ Locație trimisă la Profile (încercarea', attempt, '):', latitude, longitude);
                return;
              } catch (error) {
                console.error('Eroare la apelarea setProfileLocation:', error);
              }
            }
            
            // Dacă niciunul nu funcționează, reîncearcă
            if (attempt < 10) {
              console.warn('⚠️ Callback-urile nu sunt definite (încercarea', attempt, ')');
              setTimeout(() => trySetLocation(attempt + 1), 50);
            }
          };
          
          trySetLocation();
        });
        
        console.log('✓ Click handler setat cu succes');
      };
      
      // Așteaptă puțin pentru ca ActivityForm să se monteze
      const timeoutId = setTimeout(setupClickHandler, 100);
      
      return () => {
        clearTimeout(timeoutId);
        if (clickHandler) {
          clickHandler.remove();
          console.log('Click handler eliminat');
        }
      };
    }

    // Cleanup
    return () => {
      if (clickHandler) {
        clickHandler.remove();
      }
    };
  }, [showActivityForm, showProfile]);

  // Handler pentru click pe marker-ele activităților (doar când formularul NU este deschis)
  useEffect(() => {
    if (!viewRef.current || !activitiesLayerRef.current || showActivityForm) return;

    const handleActivityMarkerClick = async (event) => {
      try {
        // Verifică dacă click-ul a fost pe un graphic din activitiesLayer
        const hitTestResult = await viewRef.current.hitTest(event);
        const graphicResult = hitTestResult.results.find(result => 
          result.graphic && result.graphic.layer === activitiesLayerRef.current
        );
        
        if (graphicResult && graphicResult.graphic.attributes) {
          // Găsește activitatea corespunzătoare
          const activityId = graphicResult.graphic.attributes.id;
          const activity = activities.find(a => a.id === activityId);
          if (activity) {
            setSelectedActivity(activity);
            console.log('✓ Activitate selectată:', activity.title);
          }
        }
      } catch (error) {
        console.warn('Eroare la detectarea click-ului pe marker:', error);
      }
    };

    const clickHandler = viewRef.current.on('click', handleActivityMarkerClick);

    return () => {
      if (clickHandler) {
        clickHandler.remove();
      }
    };
  }, [activities, showActivityForm]);

  // Încarcă activitățile
  useEffect(() => {
    if (!mapLoaded || !userLocation) return;
    loadActivities();
  }, [mapLoaded, userLocation, filters, loadActivities]);

  // Încarcă notificările când utilizatorul este autentificat
  useEffect(() => {
    if (user && token) {
      loadNotifications();
      // Actualizează notificările la fiecare 10 secunde
      const interval = setInterval(loadNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [user, token, loadNotifications]);

  // Reîncarcă locația utilizatorului când se actualizează profilul (după salvare)
  useEffect(() => {
    if (!mapLoaded || !viewRef.current || !userLocationLayerRef.current || !user || !token) return;
    
    const reloadUserLocation = async () => {
      try {
        const profileResponse = await api.get('/api/users/me');
        const profile = profileResponse.data;
        
        if (profile.latitude && profile.longitude) {
          const longitude = profile.longitude;
          const latitude = profile.latitude;
          
          // Actualizează locația
          setUserLocation({ longitude, latitude });
          
          // Actualizează marker-ul pe hartă
          if (userLocationLayerRef.current) {
            userLocationLayerRef.current.removeAll();
            const userLocationGraphic = new Graphic({
              geometry: new Point({
                longitude: longitude,
                latitude: latitude
              }),
              symbol: new SimpleMarkerSymbol({
                color: [0, 120, 255, 1],
                outline: {
                  color: [255, 255, 255, 1],
                  width: 2
                },
                size: 12
              })
            });
            userLocationLayerRef.current.add(userLocationGraphic);
          }
          
          // Centrare pe noua locație
          if (viewRef.current) {
            viewRef.current.goTo({
              center: [longitude, latitude],
              zoom: 14
            }).catch(() => {});
          }
        }
      } catch (error) {
        console.warn('Eroare la reîncărcarea locației:', error);
      }
    };
    
    // Reîncarcă locația doar dacă utilizatorul este autentificat
    if (user && token) {
      reloadUserLocation();
    }
  }, [user?.id, mapLoaded, api, token]); // Reîncarcă când se schimbă user-ul sau după ce se salvează profilul

  const handleActivityCreated = () => {
    setShowActivityForm(false);
    loadActivities();
    // Șterge marker-ul roșu de selecție locație (dar păstrează bulina albastră)
    if (selectedLocationLayerRef.current) {
      selectedLocationLayerRef.current.removeAll();
    }
  };

  const handleActivitySelected = (activity) => {
    setSelectedActivity(activity);
  };

  return (
    <div className="map-view-container">
      <div className="map-header">
        <h1>SocialExplore</h1>
        <div className="header-actions">
          <button onClick={() => setShowProfile(true)} className="btn-header">
            Profil
          </button>
          <button onClick={() => setShowFriends(true)} className="btn-header">
            Prieteni
          </button>
          {notificationsCount > 0 && (
            <NotificationsDropdown
              key={notificationsUpdateKey}
              count={notificationsCount}
              onNotificationClick={(notification) => {
                console.log('Click pe notificare în MapView:', notification);
                
                // Pentru notificările de prietenie, deschide lista de prieteni
                if (notification.type === 'friend_request_received') {
                  setFriendsListTab('received'); // Deschide tab-ul "Cereri primite"
                  setShowFriends(true);
                } else if (notification.type === 'friend_request_accepted') {
                  setFriendsListTab('friends'); // Deschide tab-ul "Prieteni"
                  setShowFriends(true);
                } else {
                  // Pentru notificările de activități, găsește activitatea și o deschide
                  const activity = activities.find(a => a.id === notification.activity_id);
                  if (activity) {
                    setSelectedActivity(activity);
                  }
                }
              }}
              onNotificationsUpdated={async () => {
                await loadNotifications();
                setNotificationsUpdateKey(prev => prev + 1);
              }}
            />
          )}
          <span className="user-name">Bună, {user?.name || 'Utilizator'}!</span>
          <button onClick={logout} className="btn-logout">
            Deconectare
          </button>
        </div>
      </div>

      <div className="map-content">
        <div className="map-sidebar">
          <div className="sidebar-section">
            <h2>Filtre</h2>
            <div className="filter-group">
              <label>Categorie:</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              >
                <option value="">Toate</option>
                <option value="sport">Sport</option>
                <option value="food">Mâncare</option>
                <option value="games">Jocuri</option>
                <option value="volunteer">Voluntariat</option>
                <option value="other">Altele</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Distanță maximă (km):</label>
              <input
                type="number"
                min="1"
                max="50"
                value={filters.maxDistance}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = parseInt(value);
                  // Validează input-ul - dacă este gol sau invalid, folosește valoarea curentă
                  if (value === '' || isNaN(numValue) || numValue < 1) {
                    return; // Nu actualiza dacă valoarea este invalidă
                  }
                  setFilters({ ...filters, maxDistance: numValue });
                }}
              />
            </div>
            <button
              onClick={() => setShowActivityForm(true)}
              className="btn-primary"
            >
              + Creează Activitate
            </button>
          </div>

          <ActivityList
            activities={activities}
            onActivitySelect={handleActivitySelected}
            selectedActivity={selectedActivity}
          />
        </div>

        <div className="map-container">
          <div 
            ref={mapDiv} 
            style={{ 
              width: '100%', 
              height: '100%',
              pointerEvents: 'auto',
              zIndex: 1
            }} 
          />
          {!mapLoaded && (
            <div className="map-loading">
              <p>Se încarcă harta...</p>
            </div>
          )}
        </div>
      </div>

      {showActivityForm && (
        <ActivityForm
          userLocation={userLocation}
          onClose={() => setShowActivityForm(false)}
          onActivityCreated={handleActivityCreated}
          view={viewRef.current}
        />
      )}

      {selectedActivity && (
        <ActivityDetails
          activity={selectedActivity}
          onClose={() => {
            setSelectedActivity(null);
            loadNotifications(); // Reîncarcă notificările când se închide activitatea
          }}
          onUpdate={() => {
            loadActivities();
            loadNotifications(); // Reîncarcă notificările când se actualizează o activitate
          }}
        />
      )}

        {showProfile && (
          <Profile
            onClose={() => {
              setShowProfile(false);
              // Curăță marker-ul de selecție când profilul se închide
              if (selectedLocationLayerRef.current) {
                selectedLocationLayerRef.current.removeAll();
              }
              // Reîncarcă locația utilizatorului după ce se salvează profilul
              if (mapLoaded && viewRef.current && userLocationLayerRef.current && user && token) {
                const reloadUserLocation = async () => {
                  try {
                    const profileResponse = await api.get('/api/users/me');
                    const profile = profileResponse.data;
                    
                    if (profile.latitude && profile.longitude) {
                      const longitude = profile.longitude;
                      const latitude = profile.latitude;
                      
                      // Actualizează locația
                      setUserLocation({ longitude, latitude });
                      
                      // Actualizează marker-ul pe hartă
                      if (userLocationLayerRef.current) {
                        userLocationLayerRef.current.removeAll();
                        const userLocationGraphic = new Graphic({
                          geometry: new Point({
                            longitude: longitude,
                            latitude: latitude
                          }),
                          symbol: new SimpleMarkerSymbol({
                            color: [0, 120, 255, 1],
                            outline: {
                              color: [255, 255, 255, 1],
                              width: 2
                            },
                            size: 12
                          })
                        });
                        userLocationLayerRef.current.add(userLocationGraphic);
                      }
                      
                      // Reîncarcă activitățile cu noua locație
                      loadActivities();
                    }
                  } catch (error) {
                    console.warn('Eroare la reîncărcarea locației:', error);
                  }
                };
                reloadUserLocation();
              }
            }}
            onUpdate={() => {
              loadActivities();
              loadNotifications();
            }}
          />
        )}

      {showFriends && (
        <FriendsList
          onClose={() => {
            setShowFriends(false);
            setFriendsListTab('friends'); // Resetează tab-ul când se închide
            loadNotifications(); // Reîncarcă notificările când se închide lista de prieteni
          }}
          userLocation={userLocation}
          initialTab={friendsListTab}
          onUpdate={loadNotifications}
        />
      )}
    </div>
  );
};

export default MapViewComponent;
