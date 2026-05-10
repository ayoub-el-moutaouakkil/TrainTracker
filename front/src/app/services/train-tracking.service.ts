import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TrackingResponse, TrackJourneyRequest } from '../models/tracking.model';
import { environment } from '../../environments/environment';

export class TrackingError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class TrainTrackingService {

  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  startTracking(request: TrackJourneyRequest): Observable<TrackingResponse> {
    return this.http.post<TrackingResponse>(this.api, request)
      .pipe(catchError(this.handleError));
  }

  getTracking(journeyId: string): Observable<TrackingResponse> {
    return this.http.get<TrackingResponse>(`${this.api}/${journeyId}`)
      .pipe(catchError(this.handleError));
  }

  stopTracking(journeyId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${journeyId}`)
      .pipe(catchError(this.handleError));
  }

  private handleError(err: HttpErrorResponse): Observable<never> {
    let message: string;
    switch (err.status) {
      case 0:    message = 'Serveur injoignable. Vérifie que le backend est démarré.'; break;
      case 400:  message = 'Requête invalide.'; break;
      case 404:  message = 'Trajet introuvable.'; break;
      case 429:  message = 'Trop de requêtes. Réessaie dans quelques secondes.'; break;
      default:   message = 'Une erreur est survenue. Réessaie plus tard.'; break;
    }
    // Ne jamais exposer err.message / err.error / stack trace
    return throwError(() => new TrackingError(err.status, message));
  }
}
