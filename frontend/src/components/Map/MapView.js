import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import Polyline from '@arcgis/core/geometry/Polyline';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import PopupTemplate from '@arcgis/core/PopupTemplate';
import HeatmapRenderer from '@arcgis/core/renderers/HeatmapRenderer';
import * as route from '@arcgis/core/rest/route';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import axios from 'axios';
import './MapView.css';
import { useAuth } from '../../context/AuthContext';
import ActivityList from './ActivityList';
import ActivityForm from './ActivityForm';
import Profile from '../Profile/Profile';
import FriendsList from '../Friends/FriendsList';
import ActivityDetails from './ActivityDetails';
import NotificationsDropdown from '../Notifications/NotificationsDropdown';
import Dashboard from '../Dashboard/Dashboard';
import '@arcgis/core/assets/esri/themes/light/main.css';
import Polygon from '@arcgis/core/geometry/Polygon';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';

const ARCGIS_API_KEY = process.env.REACT_APP_ARCGIS_API_KEY;
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const MapViewComponent = () => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const activitiesLayerRef = useRef(null);
  const userLocationLayerRef = useRef(null);
  const countiesLayerRef = useRef(null);
  const selectedLocationLayerRef = useRef(null); // Layer separat pentru marker-ul de selecție
  const routeLayerRef = useRef(null); // Layer pentru rute
  const heatmapLayerRef = useRef(null); // Layer pentru heatmap activități
  const usersHeatmapLayerRef = useRef(null); // Layer pentru heatmap utilizatori
  const regionLayerRef = useRef(null); // layer pentru “regions/grid choropleth”
  const isMountedRef = useRef(true);
  const initRef = useRef(false); // Previne multiple inițializări
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRegionChoropleth, setShowRegionChoropleth] = useState(false);
  const [friendsListTab, setFriendsListTab] = useState('friends');
  const [filters, setFilters] = useState({
    category: '',
    maxDistance: 50,
    showNearby: true
  });
  const [userLocation, setUserLocation] = useState(null);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [notificationsUpdateKey, setNotificationsUpdateKey] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showUsersHeatmap, setShowUsersHeatmap] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(null); // Stochează informații despre ruta curentă
  const { user, token, logout } = useAuth();
  const lastGridKeyRef = useRef("");

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

  // Funcție pentru actualizare heatmap activități
  const updateHeatmap = useCallback((activitiesData) => {
    if (!heatmapLayerRef.current || !viewRef.current) return;

    // Șterge heatmap-ul existent
    try {
      heatmapLayerRef.current.removeAll();
    } catch (error) {
      console.warn('Eroare la ștergerea heatmap-ului:', error);
    }

    if (!showHeatmap || !activitiesData || activitiesData.length === 0) return;

    // Adaugă puncte pentru heatmap
    activitiesData.forEach(activity => {
      try {
        if (activity.longitude && activity.latitude) {
          const heatmapPoint = new Graphic({
            geometry: new Point({
              longitude: activity.longitude,
              latitude: activity.latitude
            }),
            attributes: {
              intensity: 1
            }
          });
          heatmapLayerRef.current.add(heatmapPoint);
        }
      } catch (error) {
        console.warn('Eroare la adăugarea punctului în heatmap:', error);
      }
    });
  }, [showHeatmap]);

  // pentru heatmap
  const cellSizeKmForZoom = (zoom) => {
    if (zoom <= 7) return 40;
    if (zoom <= 9) return 20;
    if (zoom <= 11) return 10;
    if (zoom <= 13) return 5;
    return 2;
  };

  const pubuColor = (t) => {
    // t in [0, 1]
    // PuBu ramp (white -> pale blue -> medium -> dark blue)
    const stops = [
      [255, 255, 255, 0.9],
      [222, 235, 247, 0.9],
      [158, 202, 225, 0.9],
      [49, 130, 189, 0.9],
      [8, 81, 156, 0.9],
    ];

    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = stops[i];
    const b = stops[Math.min(i + 1, stops.length - 1)];

    const lerp = (u, v) => Math.round(u + (v - u) * f);
    return [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2]), a[3]];
  };

  // Funcție pentru actualizare heatmap utilizatori
  const updateUsersHeatmap = useCallback(async () => {
    if (!usersHeatmapLayerRef.current || !viewRef.current || !userLocation) return;

    // Șterge heatmap-ul existent
    try {
      usersHeatmapLayerRef.current.removeAll();
    } catch (error) {
      console.warn('Eroare la ștergerea heatmap-ului utilizatorilor:', error);
    }

    if (!showUsersHeatmap) return;

    try {
      // Încarcă utilizatorii nearby
      const response = await api.get('/api/search/users/nearby', {
        params: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radius_km: 50 // Caută utilizatori într-o rază de 50 km
        }
      });

      const users = response.data || [];

      // Adaugă puncte pentru heatmap utilizatori
      users.forEach(user => {
        try {
          if (user.longitude && user.latitude) {
            const heatmapPoint = new Graphic({
              geometry: new Point({
                longitude: user.longitude,
                latitude: user.latitude
              }),
              attributes: {
                intensity: 1
              }
            });
            usersHeatmapLayerRef.current.add(heatmapPoint);
          }
        } catch (error) {
          console.warn('Eroare la adăugarea utilizatorului în heatmap:', error);
        }
      });
    } catch (error) {
      console.error('Eroare la încărcarea utilizatorilor pentru heatmap:', error);
    }
  }, [showUsersHeatmap, userLocation, api]);

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
            `,
            actions: [
              {
                title: "🗺️ Calculează rută",
                id: "route"
              }
            ]
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
      const validMaxDistance = (isNaN(maxDistance) || maxDistance <= 0) ? 50 : maxDistance;

      const params = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        radius_km: validMaxDistance
      };
      if (filters.category) {
        params.category = filters.category;
      }

      const response = await api.get(url, { params });
      const activitiesData = response.data;
      setActivities(activitiesData);
      // Actualizează marker-ele doar cu activitățile filtrate
      updateMapMarkers(activitiesData);
      // Actualizează heatmap-ul doar dacă este activat
      if (showHeatmap) {
        updateHeatmap(activitiesData);
      }
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

      const countiesLayer = new GeoJSONLayer({
        url: "http://localhost:8000/static/romania_counties.geojson",
        title: "Activities by County",
        visible: false,
        renderer: {
          type: "simple",
          symbol: {
            type: "simple-fill",
            outline: {
              color: "white",
              width: 0.5
            }
          },
          visualVariables: [
            {
              type: "color",
              field: "activity_count",
              stops: [
                { value: 0, color: "#f2f2f2", label: "0" },
                { value: 10, color: "#c6dbef", label: "Low" },
                { value: 30, color: "#6baed6", label: "Medium" },
                { value: 60, color: "#2171b5", label: "High" }
              ]
            }
          ]
        },
        popupTemplate: {
          title: "{name_latn}",
          content: "Activities: {activity_count}"
        }
      });

      // countiesLayer.renderer = {
      //   type: "simple",
      //   symbol: {
      //     type: "simple-fill",
      //     outline: { color: [255, 255, 255, 0.6], width: 0.5 }
      //   },
      //   visualVariables: [{
      //     type: "color",
      //     field: "activity_count",
      //     stops: [
      //       { value: 0, color: "#ffffff" },
      //       { value: 5, color: "#deebf7" },
      //       { value: 15, color: "#9ecae1" },
      //       { value: 30, color: "#3182bd" },
      //       { value: 60, color: "#08519c" }
      //     ]
      //   }]
      // };

      map.add(countiesLayer);
      countiesLayerRef.current = countiesLayer;

      // Creează view-ul hărții
      view = new MapView({
        container: mapDiv.current,
        map: map,
        center: [26.1025, 44.4268], // București (default)
        zoom: 13
      });

      viewRef.current = view;
      console.log('MapView creat cu succes');

      countiesLayer.load()
        .then(() => console.log("GeoJSON loaded OK"))
        .catch((e) => console.error("GeoJSON load failed:", e));

      view.whenLayerView(countiesLayer)
        .then(() => console.log("LayerView OK"))
        .catch((e) => console.error("LayerView failed:", e));

      // Layer pentru activități
      const activitiesLayer = new GraphicsLayer();
      map.add(activitiesLayer);
      activitiesLayerRef.current = activitiesLayer;

      // Layer pentru locația utilizatorului
      const userLocationLayer = new GraphicsLayer();
      map.add(userLocationLayer);
      userLocationLayerRef.current = userLocationLayer;

      // Layer pentru heatmap-ul refacut
      const regionLayer = new GraphicsLayer({
        opacity: 0.55,
        id: "regions-choropleth"
      });
      regionLayerRef.current = regionLayer;

      // Layer separat pentru marker-ul de selecție locație (când se creează activitate)
      const selectedLocationLayer = new GraphicsLayer();
      map.add(selectedLocationLayer);
      selectedLocationLayerRef.current = selectedLocationLayer;

      // Layer pentru rute
      const routeLayer = new GraphicsLayer();
      map.add(routeLayer);
      routeLayerRef.current = routeLayer;

      // Layer pentru heatmap activități (va fi adăugat/șters dinamic)
      const heatmapLayer = new GraphicsLayer({
        opacity: 0.7,
        id: "heatmap-activities"
      });
      heatmapLayerRef.current = heatmapLayer;
      // Nu adăugăm layer-ul pe hartă imediat - va fi adăugat când showHeatmap este true

      // Layer pentru heatmap utilizatori (va fi adăugat/șters dinamic)
      const usersHeatmapLayer = new GraphicsLayer({
        opacity: 0.7,
        id: "heatmap-users"
      });
      usersHeatmapLayerRef.current = usersHeatmapLayer;
      // Nu adăugăm layer-ul pe hartă imediat - va fi adăugat când showUsersHeatmap este true

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

        // Handler pentru click pe marker-ele activităților
        view.on("click", (event) => {
          if (showActivityForm || showProfile) {
            return; // Nu procesa click-uri când formularul este deschis
          }

          view.hitTest(event).then((response) => {
            const graphic = response.results.find(
              (result) => result.graphic && result.graphic.layer === activitiesLayerRef.current
            )?.graphic;

            if (graphic && graphic.attributes) {
              const activity = graphic.attributes;
              setSelectedActivity(activity);
            }
          });
        });

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
      routeLayerRef.current = null;
      heatmapLayerRef.current = null;
      usersHeatmapLayerRef.current = null;
      regionLayerRef.current = null;
    };
  }, []); // Rulează doar o dată la mount

  useEffect(() => {
    if (!countiesLayerRef.current) return;
    countiesLayerRef.current.visible = showRegionChoropleth;
  }, [showRegionChoropleth]);

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

  // Gestionare heatmap layer pentru activități
  useEffect(() => {
    if (!viewRef.current || !heatmapLayerRef.current || !mapLoaded) return;

    const map = viewRef.current.map;
    const heatmapLayer = heatmapLayerRef.current;

    if (showHeatmap) {
      // Aplică HeatmapRenderer
      heatmapLayer.renderer = new HeatmapRenderer({
        colorStops: [
          { ratio: 0, color: "rgba(63, 40, 102, 0)" },
          { ratio: 0.083, color: "rgba(63, 40, 102, 0.8)" },
          { ratio: 0.25, color: "rgba(63, 40, 102, 0.8)" },
          { ratio: 0.5, color: "rgba(17, 147, 154, 0.8)" },
          { ratio: 0.75, color: "rgba(77, 193, 103, 0.8)" },
          { ratio: 1, color: "rgba(255, 255, 0, 0.8)" }
        ],
        maxPixelIntensity: 75,
        minPixelIntensity: 0
      });

      // Adaugă layer-ul pe hartă dacă nu este deja adăugat
      const existingLayer = map.findLayerById(heatmapLayer.id);
      if (!existingLayer) {
        map.add(heatmapLayer);
        console.log('Heatmap layer adăugat pe hartă');
      }
      
      // Reîncarcă heatmap-ul dacă există activități
      if (activities && activities.length > 0) {
        updateHeatmap(activities);
      }
    } else {
      // Șterge layer-ul de pe hartă
      const existingLayer = map.findLayerById(heatmapLayer.id);
      if (existingLayer) {
        map.remove(heatmapLayer);
        console.log('Heatmap layer eliminat de pe hartă');
      }
    }
  }, [showHeatmap, mapLoaded, activities, updateHeatmap]);

  // Gestionare heatmap layer pentru utilizatori
  useEffect(() => {
    if (!viewRef.current || !usersHeatmapLayerRef.current) return;

    const map = viewRef.current.map;
    const usersHeatmapLayer = usersHeatmapLayerRef.current;

    if (showUsersHeatmap) {
      // Aplică HeatmapRenderer cu culori diferite pentru utilizatori
      usersHeatmapLayer.renderer = new HeatmapRenderer({
        colorStops: [
          { ratio: 0, color: "rgba(102, 40, 63, 0)" },
          { ratio: 0.083, color: "rgba(102, 40, 63, 0.8)" },
          { ratio: 0.25, color: "rgba(154, 17, 147, 0.8)" },
          { ratio: 0.5, color: "rgba(193, 77, 103, 0.8)" },
          { ratio: 0.75, color: "rgba(255, 120, 0, 0.8)" },
          { ratio: 1, color: "rgba(255, 200, 0, 0.8)" }
        ],
        maxPixelIntensity: 75,
        minPixelIntensity: 0
      });

      // Adaugă layer-ul pe hartă dacă nu este deja adăugat
      if (!map.findLayerById(usersHeatmapLayer.id)) {
        map.add(usersHeatmapLayer);
      }

      // Actualizează heatmap-ul utilizatorilor
      updateUsersHeatmap();
    } else {
      // Șterge layer-ul de pe hartă
      if (map.findLayerById(usersHeatmapLayer.id)) {
        map.remove(usersHeatmapLayer);
      }
    }
  }, [showUsersHeatmap, updateUsersHeatmap]);

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

  // Funcție pentru calculare rută folosind direct REST API
  const calculateRoute = useCallback(async (activity) => {
    if (!userLocation || !routeLayerRef.current) {
      console.warn('Locația utilizatorului sau routeLayer nu este disponibil');
      return;
    }
    if (!ARCGIS_API_KEY) {
      console.error('ARCGIS_API_KEY nu este setat! Rutarea necesită API key.');
      alert('Rutarea necesită un API key ArcGIS. Te rog configurează REACT_APP_ARCGIS_API_KEY în .env');
      return;
    }
    try {
      routeLayerRef.current.removeAll();
      
      // Construiește URL-ul cu parametri pentru serviciul de rutare
      const routeServiceUrl = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World/solve";
      
      // Formatează stops ca JSON pentru API
      const stops = {
        type: "features",
        features: [
          {
            geometry: {
              x: userLocation.longitude,
              y: userLocation.latitude,
              spatialReference: { wkid: 4326 }
            },
            attributes: { Name: "Start" }
          },
          {
            geometry: {
              x: activity.longitude,
              y: activity.latitude,
              spatialReference: { wkid: 4326 }
            },
            attributes: { Name: "End" }
          }
        ],
        spatialReference: { wkid: 4326 }
      };
      
      // Construiește parametrii pentru request
      const params = new URLSearchParams({
        f: 'json',
        token: ARCGIS_API_KEY,
        stops: JSON.stringify(stops),
        returnDirections: 'true',
        returnRoutes: 'true',
        directionsLengthUnits: 'esriNAUKilometers',
        outSR: '4326'
      });
      
      console.log('Apel serviciu rutare...');
      
      // Apelează serviciul REST
      const response = await fetch(`${routeServiceUrl}?${params.toString()}`);
      const data = await response.json();
      
      console.log('Răspuns serviciu rutare:', data);
      
      if (data.error) {
        throw new Error(data.error.message || 'Eroare la calcularea rutei');
      }
      
      if (data.routes && data.routes.features && data.routes.features.length > 0) {
        const routeFeature = data.routes.features[0];
        const routeGeometry = routeFeature.geometry;
        
        if (!routeGeometry || !routeGeometry.paths) {
          throw new Error('Geometria rutei nu este validă');
        }
        
        // Creează Polyline din geometria returnată
        const polyline = new Polyline({
          paths: routeGeometry.paths,
          spatialReference: { wkid: 4326 }
        });
        
        // Adaugă linia rutei pe hartă
        const routeGraphic = new Graphic({
          geometry: polyline,
          symbol: new SimpleLineSymbol({
            color: [0, 100, 255, 0.8],
            width: 4,
            style: "solid"
          })
        });
        
        routeLayerRef.current.add(routeGraphic);
        
        // Extrage informații despre rută
        const attrs = routeFeature.attributes || {};
        const distance = attrs.Total_Kilometers || attrs.Shape_Length || null;
        const time = attrs.Total_TravelTime || attrs.Total_Minutes || null;
        const timeMinutes = time ? Math.round(time) : null;
        
        setCurrentRoute({
          activity: activity,
          distance: distance ? Number(distance).toFixed(2) : '—',
          time: timeMinutes,
          directions: data.directions || []
        });
        
        // Centrează harta pe rută
        if (viewRef.current) {
          viewRef.current.goTo({
            target: polyline,
            padding: { top: 50, bottom: 50, left: 50, right: 50 }
          }).catch(() => {});
        }
        
        return;
      }
      
      throw new Error('Nu s-au returnat rezultate pentru rută');
      
    } catch (error) {
      console.error('Eroare la calcularea rutei:', error);
      
      // Fallback: afișează o linie dreaptă cu stil întrerupt
      if (userLocation && activity && routeLayerRef.current) {
        const straightLine = new Polyline({
          paths: [[
            [userLocation.longitude, userLocation.latitude],
            [activity.longitude, activity.latitude]
          ]],
          spatialReference: { wkid: 4326 }
        });
        
        const distance = geometryEngine.geodesicLength(straightLine, "kilometers");
        
        const routeGraphic = new Graphic({
          geometry: straightLine,
          symbol: new SimpleLineSymbol({
            color: [255, 100, 0, 0.8],
            width: 4,
            style: "dash"
          })
        });
        
        routeLayerRef.current.add(routeGraphic);
        
        setCurrentRoute({
          activity: activity,
          distance: distance.toFixed(2),
          time: null,
          directions: []
        });
        
        alert('Nu s-a putut calcula ruta automată. Afișez linie dreaptă ca aproximare.');
      }
    }
  }, [userLocation]);

  // Funcție pentru anulare rută
  const clearRoute = useCallback(() => {
    if (routeLayerRef.current) {
      routeLayerRef.current.removeAll();
    }
    setCurrentRoute(null);
  }, []);

  // Handler pentru popup actions (rutare) - trebuie să fie după definirea calculateRoute
  useEffect(() => {
    if (!viewRef.current || !mapLoaded) return;

    const view = viewRef.current;
    let handle = null;
    let watchHandle = null;
    
    const handlePopupAction = (event) => {
      if (event && event.action && event.action.id === "route") {
        const graphic = view.popup.selectedFeature;
        if (graphic && graphic.attributes) {
          const activity = graphic.attributes;
          calculateRoute(activity);
        }
      }
    };

    // Folosim watch pentru a monitoriza când popup.viewModel devine disponibil
    const setupPopupHandler = () => {
      if (view.popup && view.popup.viewModel) {
        handle = view.popup.viewModel.on("trigger-action", handlePopupAction);
        return true;
      }
      return false;
    };

    // Încearcă să seteze handler-ul imediat
    if (!setupPopupHandler()) {
      // Dacă nu este disponibil, folosim watch pentru a aștepta
      watchHandle = reactiveUtils.watch(
        () => view.popup && view.popup.viewModel,
        (hasViewModel) => {
          if (hasViewModel && !handle) {
            setupPopupHandler();
          }
        }
      );
    }

    return () => {
      if (handle && handle.remove) {
        handle.remove();
      }
      if (watchHandle && watchHandle.remove) {
        watchHandle.remove();
      }
    };
  }, [mapLoaded, calculateRoute]);

  return (
    <div className="map-view-container">
      <div className="map-header">
        <h1>SocialExplore</h1>
        <div className="header-actions">
          <button onClick={() => setShowDashboard(true)} className="btn-header">
            📊 Dashboard
          </button>
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


            <div className="filter-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showRegionChoropleth}
                  onChange={(e) => setShowRegionChoropleth(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>🟦 Afișează densitate pe regiuni (PuBu)</span>
              </label>
            </div>

            {currentRoute && (
              <div className="route-info" style={{ 
                marginTop: '10px', 
                padding: '10px', 
                background: '#e8f4f8', 
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}>
                <p><strong>📍 Ruta către:</strong> {currentRoute.activity.title}</p>
                <p><strong>Distanță:</strong> {currentRoute.distance} km</p>
                {currentRoute.time && <p><strong>Timp estimat:</strong> {currentRoute.time} min</p>}
                <button 
                  onClick={clearRoute}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  ✕ Anulează rută
                </button>
              </div>
            )}
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
          onCalculateRoute={() => {
            calculateRoute(selectedActivity);
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

      {showDashboard && (
        <Dashboard
          onClose={() => setShowDashboard(false)}
        />
      )}
    </div>
  );
};

export default MapViewComponent;
