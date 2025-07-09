import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Layers, Navigation, Target, Upload, Menu, MapPin, Settings, List, Download, Trash2, Eye, EyeOff } from 'lucide-react';
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
  const [showWaypointPanel, setShowWaypointPanel] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null);
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
          // Basic GPX/KML parsing would go here
          // For now, just show success message
          toast.success(`Uploaded ${file.name} - parsing functionality to be implemented`);
        }
      } catch (error) {
        console.error('File parsing error:', error);
        toast.error("Failed to parse file");
      }
    };
    
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    
    reader.readAsText(file);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
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
              <div className="px-3 py-1 rounded-full bg-primary-foreground/20 text-primary-foreground text-sm font-medium">
                GPS Active
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
                  <DropdownMenuItem onClick={triggerFileUpload} className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    <span>Upload GPX/KML</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
      </div>

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
    </div>
  );
};

export default HikingMap;