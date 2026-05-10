import { Injectable } from '@angular/core';
import * as L from 'leaflet';

@Injectable({ providedIn: 'root' })
export class RailwayService {

  /**
   * Projette un point sur le segment le plus proche d'une liste de segments.
   * Retourne aussi l'index du segment trouvé.
   */
  projectOntoRoute(
    lat: number,
    lon: number,
    routePoints: L.LatLng[]
  ): { point: L.LatLng; segmentIndex: number } {
    const pos = L.latLng(lat, lon);
    let nearest     = routePoints[0];
    let minDist     = Infinity;
    let segmentIndex = 0;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const proj = this.closestPointOnSegment(pos, routePoints[i], routePoints[i + 1]);
      const dist = pos.distanceTo(proj);
      if (dist < minDist) {
        minDist      = dist;
        nearest      = proj;
        segmentIndex = i;
      }
    }
    return { point: nearest, segmentIndex };
  }

  private closestPointOnSegment(p: L.LatLng, a: L.LatLng, b: L.LatLng): L.LatLng {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    if (dx === 0 && dy === 0) return a;
    const t = Math.max(0, Math.min(1,
      ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)
    ));
    return L.latLng(a.lat + t * dy, a.lng + t * dx);
  }
}
