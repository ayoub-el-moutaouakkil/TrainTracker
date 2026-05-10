import {
  Component, OnDestroy, AfterViewInit, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { interval, Subscription, EMPTY } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

import { TrainTrackingService, TrackingError } from '../../services/train-tracking.service';
import { RailwayService } from '../../services/railway.service';
import { TrackingResponse, StopInfo } from '../../models/tracking.model';

const trainIcon = L.divIcon({
  html: `<div style="
    background:#1d4ed8;border:3px solid white;border-radius:50%;
    width:30px;height:30px;box-shadow:0 2px 14px rgba(0,0,0,.55);
    display:flex;align-items:center;justify-content:center;font-size:17px;">🚄</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], className: ''
});

@Component({
  selector: 'app-tracking-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tracking-page.component.html',
  styleUrl: './tracking-page.component.scss'
})
export class TrackingPageComponent implements AfterViewInit, OnDestroy {

  trainNumber = '';
  date = new Date().toISOString().split('T')[0];
  panelOpen   = true;

  journey      = signal<TrackingResponse | null>(null);
  loading      = signal(false);
  error        = signal<string | null>(null);

  private map!: L.Map;
  private trainMarker: L.Marker | null = null;
  private trackLayers: L.Layer[]       = [];
  private stopMarkers: L.LayerGroup    = L.layerGroup();
  private pollSub?: Subscription;

  constructor(
    private trackingService: TrainTrackingService,
    private railwayService: RailwayService
  ) {}

  ngAfterViewInit(): void { this.initMap(); }
  ngOnDestroy(): void { this.pollSub?.unsubscribe(); }

  get j() { return this.journey(); }

  get statusLabel(): string {
    switch (this.j?.status) {
      case 'SCHEDULED':   return '🕐 Prévu';
      case 'IN_PROGRESS': return '🚄 En route';
      case 'ARRIVED':     return '✅ Arrivé';
      case 'CANCELLED':   return '❌ Annulé';
      default:            return '❓ Inconnu';
    }
  }

  get delayLabel(): string {
    const d = this.j?.delayMinutes ?? 0;
    if (d === 0) return 'À l\'heure';
    if (d > 0)   return `+${d} min de retard`;
    return `${Math.abs(d)} min d'avance`;
  }

  get delayClass(): string {
    const d = this.j?.delayMinutes ?? 0;
    if (d <= 0)  return 'on-time';
    if (d < 10)  return 'slight-delay';
    return 'late';
  }

  formatTime(dt: string | null | undefined): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  track(): void {
    if (!this.trainNumber || !this.date) return;
    this.loading.set(true);
    this.error.set(null);
    this.pollSub?.unsubscribe();

    this.trackingService.startTracking({ trainNumber: this.trainNumber, date: this.date })
      .subscribe({
        next: res => {
          this.loading.set(false);
          this.journey.set(res);
          this.updateMap(res);
          this.startPolling(res.journeyId);
        },
        error: (err: TrackingError) => {
          this.loading.set(false);
          this.error.set(err.message);
        }
      });
  }

  stopTracking(): void {
    const id = this.j?.journeyId;
    if (!id) return;
    this.pollSub?.unsubscribe();
    this.trackingService.stopTracking(id).subscribe();
    this.journey.set(null);
    this.clearMap();
  }

  // ── Carte ───────────────────────────────────────────────────────────────────
  private initMap(): void {
    this.map = L.map('map', { zoomControl: true, attributionControl: false }).setView([46.8, 2.3], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);
    this.stopMarkers.addTo(this.map);
  }

  private updateMap(res: TrackingResponse): void {
    this.clearMap();
    if (!res.allStops?.length) return;

    // Filtrer les arrêts hors des limites géographiques de la France
    const validStops = res.allStops.filter(s =>
      s.latitude  >= 41   && s.latitude  <= 52 &&
      s.longitude >= -6   && s.longitude <= 10.5
    );
    if (validStops.length < 2) return;

    // Points de la route dans l'ordre exact des gares
    const routePoints = validStops.map(s => L.latLng(s.latitude, s.longitude));

    // ── Position du train sur la route ────────────────────────────────────
    let trainPos: L.LatLng | null = null;
    let splitSegIdx = 0;

    if (res.currentPosition) {
      const { point, segmentIndex } = this.railwayService.projectOntoRoute(
        res.currentPosition.latitude,
        res.currentPosition.longitude,
        routePoints
      );
      trainPos     = point;
      splitSegIdx  = segmentIndex;
    } else {
      // Pas de position temps réel : split au dernier arrêt departed
      splitSegIdx = Math.max(0,
        res.allStops.reduce((last, s, i) => s.departed ? i : last, 0)
      );
    }

    // ── Tracé de la route ─────────────────────────────────────────────────
    // Portion passée (gris) : du départ au train
    const greyPts = [...routePoints.slice(0, splitSegIdx + 1)];
    if (trainPos) greyPts.push(trainPos);

    // Portion restante (bleu) : du train à l'arrivée
    const bluePts: L.LatLng[] = [];
    if (trainPos) bluePts.push(trainPos);
    bluePts.push(...routePoints.slice(splitSegIdx + 1));

    if (greyPts.length >= 2) {
      this.trackLayers.push(
        L.polyline(greyPts, { color: '#94a3b8', weight: 6, opacity: 0.8 }).addTo(this.map)
      );
    }
    if (bluePts.length >= 2) {
      this.trackLayers.push(
        L.polyline(bluePts, { color: '#2563eb', weight: 6, opacity: 0.9 }).addTo(this.map)
      );
    }

    // ── Marqueurs de gares ────────────────────────────────────────────────
    validStops.forEach((stop, i) => {
      const isFirst = i === 0;
      const isLast  = i === validStops.length - 1;
      const isNext  = !stop.departed && res.nextStop?.stationId === stop.stationId;

      const fillColor = stop.departed ? '#94a3b8'
                      : isNext        ? '#f59e0b'
                      : isLast        ? '#16a34a'
                                      : '#2563eb';
      const radius = (isFirst || isLast) ? 10 : isNext ? 8 : 6;

      L.circleMarker([stop.latitude, stop.longitude], {
        radius, color: 'white', fillColor, fillOpacity: 1, weight: 3
      })
        .bindPopup(this.stopPopup(stop))
        .addTo(this.stopMarkers);
    });

    // ── Marqueur train exactement sur la route ────────────────────────────
    if (trainPos) {
      this.trainMarker = L.marker(trainPos, { icon: trainIcon, zIndexOffset: 1000 })
        .bindPopup(`<b>Train ${res.trainNumber}</b><br>${this.delayLabel}`)
        .addTo(this.map);
    }

    const bounds = L.latLngBounds(validStops.map(s => L.latLng(s.latitude, s.longitude)));
    this.map.fitBounds(bounds, { padding: [50, 50] });
  }

  private clearMap(): void {
    this.stopMarkers.clearLayers();
    this.trackLayers.forEach(l => l.remove());
    this.trackLayers = [];
    this.trainMarker?.remove();
    this.trainMarker = null;
  }

  private stopPopup(stop: StopInfo): string {
    const arr    = this.formatTime(stop.expectedArrival  ?? stop.scheduledArrival);
    const dep    = this.formatTime(stop.expectedDeparture ?? stop.scheduledDeparture);
    const status = stop.departed ? '✅ Passé' : stop.skipped ? '⛔ Sauté' : '⏳ À venir';
    return `<b>${stop.stationName}</b><br>${status}<br>Arr: ${arr} — Dép: ${dep}`;
  }

  private startPolling(journeyId: string): void {
    this.pollSub = interval(30_000)
      .pipe(
        switchMap(() => this.trackingService.getTracking(journeyId).pipe(
          catchError(() => EMPTY)  // erreur silencieuse : on réessaie au prochain tick
        ))
      )
      .subscribe(res => {
        this.journey.set(res);
        this.updateMap(res);
      });
  }
}
