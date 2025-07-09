import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Layers, Navigation, Target, Upload, Menu, MapPin, Settings, List, Download, Trash2, Eye, EyeOff, Route, Play, Square, Save, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Position {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
}

interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
}

interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
}

interface Trail {
  id: string;
  name: string;
  points: TrailPoint[];
  startTime: Date;
  endTime?: Date;
  distance?: number;
}

const HikingMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [trackUp, setTrackUp] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [showTokenInput, setShowTokenInput] = useState(true);
  const [showWaypointPanel, setShowWaypointPanel] = useState(false);
  const [showRecordedTrailPanel, setShowRecordedTrailPanel] = useState(false);
  const [showImportedTrailPanel, setShowImportedTrailPanel] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<string | null>(null);
  const [isRecordingTrail, setIsRecordingTrail] = useState(false);
  const [currentTrail, setCurrentTrail] = useState<TrailPoint[]>([]);
  const [recordedTrails, setRecordedTrails] = useState<Trail[]>([]);
  const [importedTrails, setImportedTrails] = useState<Trail[]>([]);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const waypointMarkers = useRef<mapboxgl.Marker[]>([]);
  const trailSource = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    // Initialize map
    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle === 'street' ? 'mapbox://styles/mapbox/outdoors-v12' : 'mapbox://styles/mapbox/satellite-streets-v12',
      zoom: 13,
      center: [-74.006, 40.7128], // Default to NYC
      pitch: 0,
      bearing: 0,
    });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Add scale control
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    toast.success("Map initialized! Ready for hiking.");

    // Cleanup
    return () => {
      map.current?.remove();
    };
  }, [mapboxToken, mapStyle]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser.");
      return;
    }

    setIsTracking(true);
    toast.success("GPS tracking started!");

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newPosition: Position = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || undefined,
        };

        setCurrentPosition(newPosition);
        updateUserMarker(newPosition);
        
        // Record trail point if recording
        if (isRecordingTrail) {
          const trailPoint: TrailPoint = {
            latitude: newPosition.latitude,
            longitude: newPosition.longitude,
            timestamp: new Date(),
            accuracy: newPosition.accuracy,
          };
          setCurrentTrail(prev => [...prev, trailPoint]);
          updateTrailOnMap([...currentTrail, trailPoint]);
        }
        
        if (map.current) {
          map.current.flyTo({
            center: [newPosition.longitude, newPosition.latitude],
            zoom: 16, // Zoom in closer when GPS is active
            essential: true,
          });

          // Handle track-up mode
          if (trackUp && newPosition.heading) {
            map.current.setBearing(newPosition.heading);
          }
        }
      },
      (error) => {
        toast.error(`GPS error: ${error.message}`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );

    // Store watchId for cleanup
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  };

  const stopTracking = () => {
    setIsTracking(false);
    toast.success("GPS tracking stopped.");
  };

  const updateUserMarker = (position: Position) => {
    if (!map.current) return;

    if (userMarker.current) {
      userMarker.current.remove();
    }

    // Create custom marker element
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = 'hsl(var(--track-active))';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

    userMarker.current = new mapboxgl.Marker(el)
      .setLngLat([position.longitude, position.latitude])
      .addTo(map.current);
  };

  const addWaypoint = () => {
    if (!currentPosition) {
      toast.error("Current location not available. Enable GPS tracking first.");
      return;
    }

    const waypoint: Waypoint = {
      id: `waypoint-${Date.now()}`,
      name: `Waypoint ${waypoints.length + 1}`,
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      timestamp: new Date(),
    };

    setWaypoints([...waypoints, waypoint]);
    addWaypointMarker(waypoint);
    toast.success(`Added ${waypoint.name}`);
  };

  const addWaypointMarker = (waypoint: Waypoint) => {
    if (!map.current) return;

    // Create waypoint marker
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.style.width = '15px';
    el.style.height = '15px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = selectedWaypoint === waypoint.id ? 'hsl(var(--primary))' : 'hsl(var(--waypoint))';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 0 8px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.style.transition = 'all 0.2s ease';

    // Add click handler to select waypoint
    el.addEventListener('click', () => {
      setSelectedWaypoint(selectedWaypoint === waypoint.id ? null : waypoint.id);
    });

    const marker = new mapboxgl.Marker(el)
      .setLngLat([waypoint.longitude, waypoint.latitude])
      .setPopup(
        new mapboxgl.Popup().setHTML(`
          <div class="p-2">
            <h3 class="font-semibold">${waypoint.name}</h3>
            <p class="text-sm text-muted-foreground">
              ${waypoint.timestamp.toLocaleString()}
            </p>
          </div>
        `)
      )
      .addTo(map.current);

    waypointMarkers.current.push(marker);
  };

  const selectWaypointOnMap = (waypointId: string) => {
    const waypoint = waypoints.find(wp => wp.id === waypointId);
    if (!waypoint || !map.current) return;

    setSelectedWaypoint(waypointId);
    
    // Fly to waypoint
    map.current.flyTo({
      center: [waypoint.longitude, waypoint.latitude],
      zoom: 16,
      essential: true,
    });

    // Update marker appearance
        updateWaypointMarkers();
  };

  const updateWaypointMarkers = () => {
    waypointMarkers.current.forEach((marker, index) => {
      const waypoint = waypoints[index];
      if (waypoint) {
        const el = marker.getElement();
        el.style.backgroundColor = selectedWaypoint === waypoint.id ? 'hsl(var(--primary))' : 'hsl(var(--waypoint))';
        el.style.transform = selectedWaypoint === waypoint.id ? 'scale(1.3)' : 'scale(1)';
      }
    });
  };

  const exportWaypoints = () => {
    if (waypoints.length === 0) {
      toast.error("No waypoints to export");
      return;
    }

    const gpxContent = `<?xml version="1.0"?>
<gpx version="1.1" creator="HikeTracker">
  ${waypoints.map(wp => `
  <wpt lat="${wp.latitude}" lon="${wp.longitude}">
    <name>${wp.name}</name>
    <time>${wp.timestamp.toISOString()}</time>
  </wpt>`).join('')}
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waypoints-${new Date().toISOString().split('T')[0]}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Waypoints exported as GPX file");
  };

  const deleteWaypoint = (waypointId: string) => {
    const waypointIndex = waypoints.findIndex(wp => wp.id === waypointId);
    if (waypointIndex === -1) return;

    // Remove marker
    if (waypointMarkers.current[waypointIndex]) {
      waypointMarkers.current[waypointIndex].remove();
      waypointMarkers.current.splice(waypointIndex, 1);
    }

    // Remove waypoint
    setWaypoints(waypoints.filter(wp => wp.id !== waypointId));
    
    if (selectedWaypoint === waypointId) {
      setSelectedWaypoint(null);
    }
    
    toast.success("Waypoint deleted");
  };


  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File upload started:', file.name);

    // Validate file type
    const validTypes = ['.gpx', '.kml'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(fileExtension)) {
      toast.error("Please upload a valid GPX or KML file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (content) {
          console.log('File content loaded, parsing...');
          const trail = parseTrailFile(content, file.name, fileExtension);
          if (trail) {
            console.log('Trail parsed successfully, adding to imported trails...');
            setImportedTrails(prev => {
              console.log('Previous imported trails:', prev.length);
              const newTrails = [...prev, trail];
              console.log('New imported trails:', newTrails.length);
              return newTrails;
            });
            toast.success(`Imported ${trail.name} with ${trail.points.length} points`);
            console.log('Import completed successfully');
          } else {
            console.error('Trail parsing failed');
            toast.error("Failed to parse trail file");
          }
        }
      } catch (error) {
        console.error('File parsing error:', error);
        toast.error("Failed to parse file");
      }
    };
    
    reader.onerror = () => {
      console.error('File reader error');
      toast.error("Failed to read file");
    };
    
    reader.readAsText(file);
    
    // Clear the input value to allow re-uploading the same file
    event.target.value = '';
  };

  const parseTrailFile = (content: string, fileName: string, fileExtension: string): Trail | null => {
    try {
      let points: TrailPoint[] = [];
      console.log('Parsing file:', fileName, 'Extension:', fileExtension);
      
      if (fileExtension === '.gpx') {
        // Parse GPX
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        
        // Check for parsing errors
        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parserError) {
          console.error('GPX parsing error:', parserError.textContent);
          return null;
        }
        
        const trackPoints = xmlDoc.getElementsByTagName('trkpt');
        console.log('Found GPX track points:', trackPoints.length);
        
        for (let i = 0; i < trackPoints.length; i++) {
          const point = trackPoints[i];
          const lat = parseFloat(point.getAttribute('lat') || '0');
          const lon = parseFloat(point.getAttribute('lon') || '0');
          const timeElement = point.getElementsByTagName('time')[0];
          const time = timeElement ? new Date(timeElement.textContent || '') : new Date();
          
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            points.push({
              latitude: lat,
              longitude: lon,
              timestamp: time,
            });
          }
        }
      } else if (fileExtension === '.kml') {
        // Parse KML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        
        // Check for parsing errors
        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parserError) {
          console.error('KML parsing error:', parserError.textContent);
          return null;
        }
        
        // First try to find LineString coordinates (continuous tracks)
        const lineStrings = xmlDoc.getElementsByTagName('LineString');
        console.log('Found LineString elements:', lineStrings.length);
        
        for (let i = 0; i < lineStrings.length; i++) {
          const coordElements = lineStrings[i].getElementsByTagName('coordinates');
          if (coordElements.length > 0) {
            const coordText = coordElements[0].textContent || '';
            console.log('Processing LineString coordinates, length:', coordText.length);
            
            // Parse continuous coordinate string
            const coordPairs = coordText.trim().split(/[\s\n\r]+/).filter(pair => pair.length > 0);
            console.log('Found coordinate pairs in LineString:', coordPairs.length);
            
            coordPairs.forEach((pair) => {
              const coords = pair.split(',');
              if (coords.length >= 2) {
                const lon = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
                  points.push({
                    latitude: lat,
                    longitude: lon,
                    timestamp: new Date(),
                  });
                }
              }
            });
          }
        }
        
        // If no LineString found, try to collect all Placemark coordinates as a trail
        if (points.length === 0) {
          const placemarks = xmlDoc.getElementsByTagName('Placemark');
          console.log('Found Placemark elements:', placemarks.length);
          
          const collectedCoords: Array<{lat: number, lon: number, name?: string}> = [];
          
          for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            const coordinates = placemark.getElementsByTagName('coordinates');
            
            if (coordinates.length > 0) {
              const coordText = coordinates[0].textContent || '';
              const coords = coordText.split(',');
              
              if (coords.length >= 2) {
                const lon = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                
                if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
                  const nameElement = placemark.getElementsByTagName('name')[0];
                  const name = nameElement ? nameElement.textContent || '' : '';
                  
                  collectedCoords.push({ lat, lon, name });
                }
              }
            }
          }
          
          console.log('Collected coordinates from Placemarks:', collectedCoords.length);
          
          // Convert collected coordinates to trail points
          collectedCoords.forEach((coord, index) => {
            points.push({
              latitude: coord.lat,
              longitude: coord.lon,
              timestamp: new Date(Date.now() + index * 1000), // Space out timestamps
            });
          });
        }
        
        // Also try gx:Track coordinates
        if (points.length === 0) {
          const tracks = xmlDoc.getElementsByTagName('gx:Track');
          console.log('Found gx:Track elements:', tracks.length);
          for (let i = 0; i < tracks.length; i++) {
            const coordElements = tracks[i].getElementsByTagName('gx:coord');
            if (coordElements.length > 0) {
              for (let j = 0; j < coordElements.length; j++) {
                const coordText = coordElements[j].textContent || '';
                const [lon, lat] = coordText.trim().split(/\s+/).map(Number);
                if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
                  points.push({
                    latitude: lat,
                    longitude: lon,
                    timestamp: new Date(),
                  });
                }
              }
            }
          }
        }
      }
      
      console.log('Total parsed points:', points.length);
      
      if (points.length === 0) {
        console.error('No valid points found in file');
        return null;
      }
      
      const trail: Trail = {
        id: `imported-${Date.now()}`,
        name: fileName.replace(/\.(gpx|kml)$/i, ''),
        points: points,
        startTime: points[0].timestamp,
        endTime: points[points.length - 1].timestamp,
        distance: calculateTrailDistance(points),
      };
      
      console.log('Created trail:', trail.name, 'with', trail.points.length, 'points');
      return trail;
    } catch (error) {
      console.error('Error parsing trail file:', error);
      return null;
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const startTrailRecording = () => {
    if (!currentPosition) {
      toast.error("GPS location required to start trail recording");
      return;
    }

    setIsRecordingTrail(true);
    setCurrentTrail([{
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      timestamp: new Date(),
      accuracy: currentPosition.accuracy,
    }]);
    toast.success("Trail recording started!");
  };

  const stopTrailRecording = () => {
    if (currentTrail.length < 2) {
      toast.error("Trail too short to save");
      setIsRecordingTrail(false);
      setCurrentTrail([]);
      return;
    }

    const trail: Trail = {
      id: `trail-${Date.now()}`,
      name: `Trail ${recordedTrails.length + 1}`,
      points: currentTrail,
      startTime: currentTrail[0].timestamp,
      endTime: new Date(),
      distance: calculateTrailDistance(currentTrail),
    };

    setRecordedTrails([...recordedTrails, trail]);
    setIsRecordingTrail(false);
    setCurrentTrail([]);
    
    // Clear current trail from map
    if (map.current && trailSource.current) {
      map.current.removeLayer('current-trail-line');
      map.current.removeSource(trailSource.current);
      trailSource.current = null;
    }
    
    toast.success(`Trail "${trail.name}" saved!`);
  };

  const calculateTrailDistance = (points: TrailPoint[]): number => {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      distance += getDistanceBetweenPoints(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return distance;
  };

  const getDistanceBetweenPoints = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const updateTrailOnMap = (points: TrailPoint[]) => {
    if (!map.current || points.length < 2) return;

    const coordinates = points.map(p => [p.longitude, p.latitude]);
    
    if (trailSource.current) {
      const source = map.current.getSource(trailSource.current) as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        });
      }
    } else {
      const sourceId = `current-trail-${Date.now()}`;
      trailSource.current = sourceId;
      
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      map.current.addLayer({
        id: 'current-trail-line',
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'hsl(var(--track-active))',
          'line-width': 4,
          'line-opacity': 0.8
        }
      });
    }
  };

  const selectTrailOnMap = (trailId: string, isImported = false) => {
    const trailList = isImported ? importedTrails : recordedTrails;
    const trail = trailList.find(t => t.id === trailId);
    if (!trail || !map.current) return;

    setSelectedTrail(trailId);
    
    // Remove existing trail layer if it exists
    if (map.current.getLayer('selected-trail-line')) {
      map.current.removeLayer('selected-trail-line');
    }
    if (map.current.getSource('selected-trail')) {
      map.current.removeSource('selected-trail');
    }

    const coordinates = trail.points.map(p => [p.longitude, p.latitude]);
    
    // Ensure we have valid coordinates
    if (coordinates.length === 0) {
      toast.error("Trail has no valid coordinates");
      return;
    }
    
    map.current.addSource('selected-trail', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      }
    });

    map.current.addLayer({
      id: 'selected-trail-line',
      type: 'line',
      source: 'selected-trail',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': isImported ? '#ef4444' : 'hsl(var(--primary))', // Red for imported, primary for recorded
        'line-width': 4,
        'line-opacity': 0.9
      }
    });

    // Fit map to trail bounds
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord as [number, number]));
    map.current.fitBounds(bounds, { padding: 50 });
    
    toast.success(`Showing trail: ${trail.name}`);
  };

  const deleteTrail = (trailId: string, isImported = false) => {
    if (isImported) {
      setImportedTrails(importedTrails.filter(t => t.id !== trailId));
    } else {
      setRecordedTrails(recordedTrails.filter(t => t.id !== trailId));
    }
    
    if (selectedTrail === trailId) {
      setSelectedTrail(null);
      // Remove trail from map
      if (map.current && map.current.getLayer('selected-trail-line')) {
        map.current.removeLayer('selected-trail-line');
        map.current.removeSource('selected-trail');
      }
    }
    
    toast.success("Trail deleted");
  };

  const exportTrail = (trailId: string, isImported = false) => {
    const trailList = isImported ? importedTrails : recordedTrails;
    const trail = trailList.find(t => t.id === trailId);
    if (!trail) return;

    const gpxContent = `<?xml version="1.0"?>
<gpx version="1.1" creator="HikeTracker">
  <trk>
    <name>${trail.name}</name>
    <trkseg>
      ${trail.points.map(point => `
      <trkpt lat="${point.latitude}" lon="${point.longitude}">
        <time>${point.timestamp.toISOString()}</time>
      </trkpt>`).join('')}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trail.name.replace(/\s+/g, '-')}-${trail.startTime.toISOString().split('T')[0]}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Trail "${trail.name}" exported as GPX file`);
  };

  if (showTokenInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">HikeTracker</h1>
              <p className="text-muted-foreground">Enter your Mapbox token to get started</p>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="pk.your_mapbox_token_here"
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                className="w-full p-3 border rounded-lg"
              />
              <p className="text-xs text-muted-foreground">
                Get your token from{' '}
                <a href="https://mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  mapbox.com
                </a>
              </p>
            </div>
            <Button 
              onClick={() => setShowTokenInput(false)} 
              disabled={!mapboxToken}
              className="w-full"
            >
              Start Hiking
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-background to-secondary/20">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 rounded-lg shadow-elegant overflow-hidden" />
      
      {/* Beautiful Header */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-r from-primary/90 to-primary-glow/90 backdrop-blur-md border-b border-border/20 z-10">
        <div className="flex items-center justify-between h-full px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-primary-foreground">HikeTracker</h1>
          </div>
          <div className="flex items-center gap-4">
            {currentPosition && (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 rounded-full bg-primary-foreground/20 text-primary-foreground text-sm font-medium">
                  GPS Active
                </div>
                {isRecordingTrail && (
                  <div className="px-3 py-1 rounded-full bg-red-500/80 text-white text-sm font-medium animate-pulse">
                    Recording Trail
                  </div>
                )}
              </div>
            )}
            
            {/* Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/30">
                  <Settings className="w-4 h-4 mr-2" />
                  Controls
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-card/95 backdrop-blur-md border border-border/50">
                <DropdownMenuLabel className="text-foreground/80">Map Controls</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setMapStyle('street')} className="cursor-pointer">
                    <Layers className="w-4 h-4 mr-2" />
                    <span>Street Map</span>
                    {mapStyle === 'street' && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMapStyle('satellite')} className="cursor-pointer">
                    <Layers className="w-4 h-4 mr-2" />
                    <span>Satellite Map</span>
                    {mapStyle === 'satellite' && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground/80">GPS & Tracking</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={isTracking ? stopTracking : startTracking} className="cursor-pointer">
                    <Target className="w-4 h-4 mr-2" />
                    <span>{isTracking ? 'Stop GPS' : 'Start GPS'}</span>
                    {isTracking && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTrackUp(!trackUp)} className="cursor-pointer">
                    <Navigation className="w-4 h-4 mr-2" />
                    <span>Track Up Mode</span>
                    {trackUp && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground/80">Trail Recording</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem 
                    onClick={isRecordingTrail ? stopTrailRecording : startTrailRecording} 
                    disabled={!currentPosition}
                    className="cursor-pointer"
                  >
                    {isRecordingTrail ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    <span>{isRecordingTrail ? 'Stop Recording' : 'Start Recording'}</span>
                    {isRecordingTrail && <span className="ml-auto text-red-500">●</span>}
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground/80">Actions</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={addWaypoint} disabled={!currentPosition} className="cursor-pointer">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>Add Waypoint</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowWaypointPanel(!showWaypointPanel)} className="cursor-pointer">
                    <List className="w-4 h-4 mr-2" />
                    <span>Manage Waypoints</span>
                    {showWaypointPanel && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowRecordedTrailPanel(!showRecordedTrailPanel)} className="cursor-pointer">
                    <Route className="w-4 h-4 mr-2" />
                    <span>Recorded Trails</span>
                    {showRecordedTrailPanel && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowImportedTrailPanel(!showImportedTrailPanel)} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    <span>Imported Trails</span>
                    {showImportedTrailPanel && <span className="ml-auto text-primary">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={triggerFileUpload} className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    <span>Upload GPX/KML</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx,.kml"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Enhanced Position Info */}
      {currentPosition && (
        <Card className="absolute bottom-4 left-4 p-4 bg-card/95 backdrop-blur-md border border-border/50 shadow-elegant">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground/80 uppercase tracking-wide mb-2">Location</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latitude:</span>
                <span className="font-mono">{currentPosition.latitude.toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Longitude:</span>
                <span className="font-mono">{currentPosition.longitude.toFixed(6)}</span>
              </div>
              {currentPosition.accuracy && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accuracy:</span>
                  <span className="font-mono">±{currentPosition.accuracy.toFixed(0)}m</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Waypoint Management Panel */}
      {showWaypointPanel && (
        <Card className="absolute top-20 right-4 p-4 w-80 bg-card/95 backdrop-blur-md border border-border/50 shadow-elegant max-h-[calc(100vh-200px)] overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">Waypoints</h3>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  {waypoints.length}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWaypointPanel(false)}
                  className="h-6 w-6 p-0"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {waypoints.length > 0 && (
              <div className="flex gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportWaypoints}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </div>
            )}
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {waypoints.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No waypoints yet. Add some using GPS!
                </div>
              ) : (
                waypoints.map((wp, index) => (
                  <div 
                    key={wp.id} 
                    className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      selectedWaypoint === wp.id 
                        ? 'bg-primary/20 border-primary/50' 
                        : 'bg-muted/50 border-border/30 hover:bg-muted/70'
                    }`}
                    onClick={() => selectWaypointOnMap(wp.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{wp.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {wp.timestamp.toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6 rounded-full bg-waypoint/20 border-2 border-waypoint flex items-center justify-center">
                          <span className="text-xs font-bold text-waypoint">{index + 1}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWaypoint(wp.id);
                          }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Recorded Trails Management Panel */}
      {showRecordedTrailPanel && (
        <Card className="absolute top-20 left-4 p-4 w-80 bg-card/95 backdrop-blur-md border border-border/50 shadow-elegant max-h-[calc(100vh-200px)] overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">Recorded Trails</h3>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  {recordedTrails.length}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRecordedTrailPanel(false)}
                  className="h-6 w-6 p-0"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recordedTrails.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No recorded trails yet. Start recording to create your first trail!
                </div>
              ) : (
                recordedTrails.map((trail, index) => (
                  <div 
                    key={trail.id} 
                    className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      selectedTrail === trail.id 
                        ? 'bg-primary/20 border-primary/50' 
                        : 'bg-muted/50 border-border/30 hover:bg-muted/70'
                    }`}
                    onClick={() => selectTrailOnMap(trail.id, false)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{trail.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {trail.startTime.toLocaleDateString()} • {trail.points.length} points
                        </div>
                        {trail.distance && (
                          <div className="text-xs text-muted-foreground">
                            {(trail.distance / 1000).toFixed(2)} km
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportTrail(trail.id, false);
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTrail(trail.id, false);
                          }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Imported Trails Management Panel */}
      {showImportedTrailPanel && (
        <Card className="absolute top-20 right-4 p-4 w-80 bg-card/95 backdrop-blur-md border border-border/50 shadow-elegant max-h-[calc(100vh-200px)] overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">Imported Trails</h3>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  {importedTrails.length}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImportedTrailPanel(false)}
                  className="h-6 w-6 p-0"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {importedTrails.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No imported trails yet. Upload GPX/KML files to import trails!
                </div>
              ) : (
                importedTrails.map((trail, index) => (
                  <div 
                    key={trail.id} 
                    className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      selectedTrail === trail.id 
                        ? 'bg-primary/20 border-primary/50' 
                        : 'bg-muted/50 border-border/30 hover:bg-muted/70'
                    }`}
                    onClick={() => selectTrailOnMap(trail.id, true)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{trail.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Imported • {trail.points.length} points
                        </div>
                        {trail.distance && (
                          <div className="text-xs text-muted-foreground">
                            {(trail.distance / 1000).toFixed(2)} km
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportTrail(trail.id, true);
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTrail(trail.id, true);
                          }}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default HikingMap;