package com.TrainTracker.backend.service;

import com.google.protobuf.CodedInputStream;
import com.google.protobuf.WireFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

/**
 * Récupère le flux GTFS-RT SNCF (protobuf binaire) depuis transport.data.gouv.fr
 * et extrait les retards par arrêt pour un trip donné.
 *
 * Structure proto GTFS-RT utilisée :
 *   FeedMessage
 *     → FeedEntity     (field 2, repeated)
 *         → TripUpdate (field 4)
 *             → TripDescriptor.trip_id (field 1 > field 1)
 *             → StopTimeUpdate[]      (field 2, repeated)
 *                 → stop_id           (field 4)
 *                 → arrival.delay     (field 2 > field 3)  en secondes
 *                 → departure.delay   (field 3 > field 3)
 */
@Service
public class GtfsRtService {

    private static final Logger log = LoggerFactory.getLogger(GtfsRtService.class);

    // Numéros de champs GTFS-RT (spec officielle)
    private static final int FEED_ENTITY        = 2;
    private static final int ENTITY_TRIP_UPDATE = 4;
    private static final int TRIP_UPDATE_TRIP   = 1;
    private static final int TRIP_UPDATE_STU    = 2;
    private static final int TRIP_DESC_ID       = 1;
    private static final int STU_ARRIVAL        = 2;
    private static final int STU_DEPARTURE      = 3;
    private static final int STU_STOP_ID        = 4;
    private static final int STOP_EVENT_DELAY   = 3;

    @Value("${gtfs.rt.url}")
    private String gtfsRtUrl;

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(java.time.Duration.ofSeconds(10))
            .build();

    /**
     * Retourne une map stop_id → retard en secondes pour le trip donné.
     * Map vide si le train n'est pas encore dans le feed (pas encore parti).
     */
    public Map<String, Integer> getDelays(String tripId) {
        Map<String, Integer> delays = new HashMap<>();
        try {
            HttpClient client = HTTP_CLIENT;
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(gtfsRtUrl))
                    .timeout(java.time.Duration.ofSeconds(15))
                    .GET()
                    .build();

            HttpResponse<InputStream> response =
                    client.send(request, HttpResponse.BodyHandlers.ofInputStream());

            parseGtfsRtFeed(response.body(), tripId, delays);

        } catch (Exception e) {
            log.warn("Impossible de récupérer les données GTFS-RT : {}", e.getMessage());
        }
        return delays;
    }

    // ─── Parser protobuf manuel ───────────────────────────────────────────────────

    private void parseGtfsRtFeed(InputStream is, String targetTripId,
                                  Map<String, Integer> delays) throws Exception {
        CodedInputStream feed = CodedInputStream.newInstance(is);
        feed.setSizeLimit(50 * 1024 * 1024); // 50 MB max

        int tag;
        while ((tag = feed.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == FEED_ENTITY) {
                byte[] entityBytes = feed.readByteArray();
                if (parseFeedEntity(entityBytes, targetTripId, delays)) {
                    return; // trouvé, inutile de continuer
                }
            } else {
                feed.skipField(tag);
            }
        }
    }

    /** @return true si c'était le bon trip et que les retards ont été remplis */
    private boolean parseFeedEntity(byte[] bytes, String targetTripId,
                                    Map<String, Integer> delays) throws Exception {
        CodedInputStream entity = CodedInputStream.newInstance(bytes);
        int tag;
        while ((tag = entity.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == ENTITY_TRIP_UPDATE) {
                byte[] tuBytes = entity.readByteArray();
                return parseTripUpdate(tuBytes, targetTripId, delays);
            } else {
                entity.skipField(tag);
            }
        }
        return false;
    }

    private boolean parseTripUpdate(byte[] bytes, String targetTripId,
                                    Map<String, Integer> delays) throws Exception {
        // Première passe : vérifier que c'est le bon trip_id
        String tripId = extractTripId(bytes);
        if (!targetTripId.equals(tripId)) return false;

        // Deuxième passe : extraire les StopTimeUpdates
        CodedInputStream tu = CodedInputStream.newInstance(bytes);
        int tag;
        while ((tag = tu.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == TRIP_UPDATE_STU) {
                parseStopTimeUpdate(tu.readByteArray(), delays);
            } else {
                tu.skipField(tag);
            }
        }
        return true;
    }

    private String extractTripId(byte[] bytes) throws Exception {
        CodedInputStream tu = CodedInputStream.newInstance(bytes);
        int tag;
        while ((tag = tu.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == TRIP_UPDATE_TRIP) {
                byte[] descBytes = tu.readByteArray();
                return extractStringField(descBytes, TRIP_DESC_ID);
            } else {
                tu.skipField(tag);
            }
        }
        return "";
    }

    private void parseStopTimeUpdate(byte[] bytes,
                                     Map<String, Integer> delays) throws Exception {
        CodedInputStream stu = CodedInputStream.newInstance(bytes);
        String stopId = null;
        int delay = 0;
        int tag;
        while ((tag = stu.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            switch (field) {
                case STU_STOP_ID    -> stopId = stu.readString();
                case STU_ARRIVAL    -> delay = extractDelay(stu.readByteArray());
                case STU_DEPARTURE  -> { if (delay == 0) delay = extractDelay(stu.readByteArray()); else stu.skipField(tag); }
                default             -> stu.skipField(tag);
            }
        }
        if (stopId != null) {
            delays.put(stopId, delay);
        }
    }

    private int extractDelay(byte[] bytes) throws Exception {
        CodedInputStream event = CodedInputStream.newInstance(bytes);
        int tag;
        while ((tag = event.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == STOP_EVENT_DELAY) {
                return event.readInt32();
            } else {
                event.skipField(tag);
            }
        }
        return 0;
    }

    private String extractStringField(byte[] bytes, int targetField) throws Exception {
        CodedInputStream input = CodedInputStream.newInstance(bytes);
        int tag;
        while ((tag = input.readTag()) != 0) {
            int field = WireFormat.getTagFieldNumber(tag);
            if (field == targetField) {
                return input.readString();
            } else {
                input.skipField(tag);
            }
        }
        return "";
    }
}
