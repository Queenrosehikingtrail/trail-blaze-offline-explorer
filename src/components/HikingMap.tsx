import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Layers, Navigation, Target, Upload } from 'lucide-react';
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
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const waypointMarkers = useRef<mapboxgl.Marker[]>([]);

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
        
        if (map.current) {
          map.current.flyTo({
            center: [newPosition.longitude, newPosition.latitude],
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
    el.style.backgroundColor = 'hsl(var(--waypoint))';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 0 8px rgba(0,0,0,0.3)';

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        // Basic GPX/KML parsing would go here
        // For now, just show success message
        toast.success(`Uploaded ${file.name} - parsing functionality to be implemented`);
      } catch (error) {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsText(file);
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
    <div className="relative w-full h-screen">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Control Panel */}
      <Card className="absolute top-4 left-4 p-3 space-y-2 bg-card/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            variant={mapStyle === 'street' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMapStyle('street')}
          >
            <Layers className="w-4 h-4" />
            Street
          </Button>
          <Button
            variant={mapStyle === 'satellite' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMapStyle('satellite')}
          >
            <Layers className="w-4 h-4" />
            Satellite
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={isTracking ? 'destructive' : 'default'}
            size="sm"
            onClick={isTracking ? stopTracking : startTracking}
          >
            <Target className="w-4 h-4" />
            {isTracking ? 'Stop GPS' : 'Start GPS'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={trackUp ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrackUp(!trackUp)}
          >
            <Navigation className="w-4 h-4" />
            Track Up
          </Button>
        </div>

        <Button size="sm" onClick={addWaypoint} disabled={!currentPosition}>
          Add Waypoint
        </Button>

        <div className="relative">
          <input
            type="file"
            accept=".gpx,.kml"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Button size="sm" variant="outline" className="w-full">
            <Upload className="w-4 h-4 mr-2" />
            Upload GPX/KML
          </Button>
        </div>
      </Card>

      {/* Position Info */}
      {currentPosition && (
        <Card className="absolute bottom-4 left-4 p-3 bg-card/90 backdrop-blur-sm">
          <div className="text-sm space-y-1">
            <div>Lat: {currentPosition.latitude.toFixed(6)}</div>
            <div>Lng: {currentPosition.longitude.toFixed(6)}</div>
            {currentPosition.accuracy && (
              <div>Accuracy: ±{currentPosition.accuracy.toFixed(0)}m</div>
            )}
          </div>
        </Card>
      )}

      {/* Waypoints List */}
      {waypoints.length > 0 && (
        <Card className="absolute top-4 right-4 p-3 max-w-xs bg-card/90 backdrop-blur-sm">
          <h3 className="font-semibold mb-2">Waypoints ({waypoints.length})</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {waypoints.map((wp) => (
              <div key={wp.id} className="text-sm p-2 bg-muted rounded">
                <div className="font-medium">{wp.name}</div>
                <div className="text-muted-foreground">
                  {wp.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default HikingMap;