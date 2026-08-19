## Database Schema

> Reflète l'état actuel de `schema.prisma` (branche `data_base_definition`).

Modèles actifs : `User`, `Circle`, `LinkSentinels`, `LinkSentinelsEvent`, `Alert`, `AlertParticipant`, `Conversation`, `ConversationParticipant`, `Message`.
Principe central : rien n'est jamais vraiment supprimé — `User`/`Circle`/`LinkSentinels` se ferment ou s'anonymisent, mais restent référençables pour toujours. Pas de tables-copies (`CircleAlert`/`LinkSentinelAlert` n'existent plus), pas de journal d'événements séparé (`AlertEvent` a été remplacé par des timestamps d'étape directement sur `Alert`).

```mermaid
erDiagram
  User               ||--o{ Circle                   : "companion (MyCirclesAsCompanion)"
  User               ||--o{ LinkSentinels            : "companion (SentinelCompanion)"
  User               ||--o{ LinkSentinels            : "sentinel (LinkAsSentinel)"
  User               ||--o{ Alert                    : "companion (MyAlertsAsCompanion)"
  User               ||--o{ Alert                    : "launchedBy? / closedBy?"
  User               ||--o{ ConversationParticipant  : "user"
  User               ||--o{ Message                  : "sender"
  Circle             ||--o{ LinkSentinels             : "circle"
  Circle             ||--o{ Alert                     : "firstCircle"
  Circle             ||--o{ AlertParticipant           : "circle (figé)"
  LinkSentinels      ||--o{ LinkSentinelsEvent        : "events"
  LinkSentinels      ||--o{ AlertParticipant          : "alertParticipations"
  Alert              ||--o{ AlertParticipant          : "participants"
  Alert              ||--o{ Conversation              : "conversations"
  Conversation        ||--o{ ConversationParticipant  : "participants"
  Conversation        ||--o{ Message                  : "messages"

  User {
    string id PK
    string firstName
    string phone UK "nullable, anonymisable"
    enum   status
    enum   userType
  }

  Circle {
    string id PK
    string label
    enum   circleType
    enum   status
    string companionId FK
  }

  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    string circleId FK
    enum   status
    enum   sentinelType
    enum   initiatedBy
    enum   leadSlot
  }

  LinkSentinelsEvent {
    string id PK
    string linkSentinelsId FK
    enum   fromStatus
    enum   toStatus
    datetime occurredAt
  }

  Alert {
    string id PK
    string label
    string messageAlert
    enum   alertStatus
    enum   alertType
    datetime launchedAt
    datetime activatedAt
    datetime closingAt
    datetime closedAt
    string companionId FK
    string firstCircleId FK
    string launchedById FK "optional"
    string closedById FK "optional"
  }

  AlertParticipant {
    string id PK
    string alertId FK
    string linkSentinelsId FK
    string circleId FK
    string circleName "figé"
    enum   status
    boolean isLead
    boolean canSendPhoneAtAlert
  }

  Conversation {
    string id PK
    string alertId FK "optional"
  }

  ConversationParticipant {
    string id PK
    string conversationId FK
    string userId FK
    datetime joinedAt
    datetime leftAt
  }

  Message {
    string id PK
    string body
    enum   type
    string senderId FK
    string conversationId FK
  }
```

---

## Vue "Sentinel"

Ce que `User` touche quand il agit **comme sentinelle**.

```mermaid
erDiagram
  User              ||--o{ LinkSentinels      : "sentinel (LinkAsSentinel)"
  LinkSentinels     }o--||  Circle            : "circle"
  LinkSentinels     ||--o{ LinkSentinelsEvent : "events"
  LinkSentinels     ||--o{ AlertParticipant   : "alertParticipations"
  AlertParticipant  }o--||  Alert             : "alert"
  AlertParticipant  }o--||  Circle            : "circle (figé)"

  User {
    string id PK
  }
  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    string circleId FK
    enum   status
    enum   sentinelType
  }
  Circle {
    string id PK
    string companionId FK
  }
  LinkSentinelsEvent {
    string id PK
    enum   toStatus
    datetime occurredAt
  }
  AlertParticipant {
    string id PK
    string alertId FK
    string circleId FK
    string circleName
    enum   status
    boolean isLead
  }
  Alert {
    string id PK
    string companionId FK
  }
```

- `LinkAsSentinel` : les cercles où ce `User` est enregistré comme sentinelle.
- `alertParticipations` : l'historique de toutes les alertes où ce `User` a été sollicité — via son `LinkSentinels`, sans copier son identité. `circleId`/`circleName` figent le cercle tel qu'il était à ce moment, car `LinkSentinels.circleId` peut changer après coup.

## Vue "Companion"

Ce que `User` touche quand il agit **comme companion**.

```mermaid
erDiagram
  User          ||--o{ Circle             : "companion (MyCirclesAsCompanion)"
  User          ||--o{ LinkSentinels      : "companion (SentinelCompanion)"
  User          ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User          ||--o{ Alert              : "launchedBy? / closedBy?"
  Circle        ||--o{ LinkSentinels      : "circle"
  Circle        ||--o{ Alert              : "firstCircle"
  Alert         ||--o{ AlertParticipant   : "participants"
  Alert         ||--o{ Conversation       : "conversations"
  Conversation  ||--o{ Message            : "messages"

  User {
    string id PK
  }
  Circle {
    string id PK
    string label
    enum   circleType
    string companionId FK
  }
  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    enum   status
  }
  Alert {
    string id PK
    string messageAlert
    enum   alertStatus
    enum   alertType
    datetime launchedAt
    datetime closedAt
    string companionId FK
    string firstCircleId FK
  }
  AlertParticipant {
    string id PK
    string linkSentinelsId FK
    enum   status
  }
  Conversation {
    string id PK
    string alertId FK "optional"
  }
  Message {
    string id PK
    string senderId FK
  }
```

- `MyCirclesAsCompanion` : les cercles que ce `User` possède.
- `MyAlertsAsCompanion` : les alertes que ce `User` a déclenchées.
- `firstCircle` sur `Alert` pointe directement sur `Circle` (permanent) — plus besoin de snapshot.
- `Alert.launchedBy`/`closedBy` pointent directement sur `User` — couvre aussi bien le cas où c'est le companion lui-même (`AlertType.BYCOMPANION`) que le cas où c'est une sentinelle.

---

## Schéma "avant alerte"

Le monde vivant : cercles, liens sentinelles (jamais fermés/recréés, juste transitionnés), leur journal minimal, et la messagerie 1:1 permanente.

```mermaid
erDiagram
  User          ||--o{ Circle              : "companion (MyCirclesAsCompanion)"
  User          ||--o{ LinkSentinels       : "companion (SentinelCompanion)"
  User          ||--o{ LinkSentinels       : "sentinel (LinkAsSentinel)"
  Circle        ||--o{ LinkSentinels       : "circle"
  LinkSentinels ||--o{ LinkSentinelsEvent  : "events"
  User          ||--o{ ConversationParticipant : "user"
  ConversationParticipant }o--|| Conversation  : "conversation"
  Conversation  ||--o{ Message             : "messages"
  User          ||--o{ Message             : "sender"

  User {
    string id PK
    string firstName
    string phone UK "nullable"
    enum   status
  }
  Circle {
    string id PK
    string label
    enum   circleType
    enum   status
    string companionId FK
  }
  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    string circleId FK
    enum   status
    enum   sentinelType
  }
  LinkSentinelsEvent {
    string id PK
    enum   fromStatus
    enum   toStatus
    datetime occurredAt
  }
  ConversationParticipant {
    string id PK
    string userId FK
  }
  Conversation {
    string id PK
    string alertId FK "null ici"
  }
  Message {
    string id PK
    string body
    string senderId FK
  }
```

Chaque transition de statut (`PENDING→ACCEPTED`, `ACCEPTED→REMOVED`...) crée une ligne `LinkSentinelsEvent` — seule trace d'historique hors alerte, et elle sert aussi de déclencheur de notification ("Anna a quitté ton 1er cercle"). Une conversation hors alerte a `alertId = null` ; on la retrouve en cherchant, via `ConversationParticipant`, une conversation sans alerte partagée par exactement ces 2 users.

## Schéma "pendant alerte"

Ce qui se déclenche une fois une alerte lancée : qui a participé (référence directe au lien permanent, pas de copie), les étapes franchies, et les conversations scopées à l'alerte.

```mermaid
erDiagram
  User               ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User               ||--o{ Alert              : "launchedBy? / closedBy?"
  Circle             ||--o{ Alert              : "firstCircle"
  Circle             ||--o{ AlertParticipant   : "circle (figé)"
  Alert              ||--o{ AlertParticipant   : "participants"
  Alert              ||--o{ Conversation       : "conversations"
  LinkSentinels      ||--o{ AlertParticipant   : "alertParticipations"
  Conversation        ||--o{ ConversationParticipant : "participants"
  Conversation        ||--o{ Message           : "messages"

  User {
    string id PK
  }
  Circle {
    string id PK
  }
  Alert {
    string id PK
    string label
    string messageAlert
    enum   alertStatus
    enum   alertType
    datetime launchedAt
    datetime activatedAt
    datetime closingAt
    datetime closedAt
    string companionId FK
    string firstCircleId FK
    string launchedById FK "optional"
    string closedById FK "optional"
  }
  LinkSentinels {
    string id PK
  }
  AlertParticipant {
    string id PK
    string alertId FK
    string linkSentinelsId FK
    string circleId FK
    string circleName
    enum   status
    boolean isLead
    boolean canSendPhoneAtAlert
  }
  Conversation {
    string id PK
    string alertId FK
  }
  ConversationParticipant {
    string id PK
    string userId FK
  }
  Message {
    string id PK
    string senderId FK
  }
```

`AlertParticipant.linkSentinelsId` est obligatoire — il pointe toujours sur le lien vivant, jamais une copie. Le cas "companion s'auto-alerte" (`AlertType.BYCOMPANION`) n'a pas besoin de `AlertParticipant` : `Alert.launchedBy` pointe directement sur `User`. Les 3 "genres" de conversation pendant une alerte (groupe du 1er cercle, 1er cercle ↔ un autre cercle, 1er cercle ↔ une sentinelle) ne sont plus typés en DB — ils se distinguent uniquement par leurs `ConversationParticipant`, une question de logique backend, pas de schéma.

---

## Légende — les différents mécanismes d'historique

- **`LinkSentinels`** : lien vivant User↔Circle, une seule ligne par paire, jamais supprimée — juste son `status` change (`PENDING`/`ACCEPTED`/`REMOVED`/`BLOCKED`...).
- **`LinkSentinelsEvent`** : journal append-only de chaque transition de statut — trace minimale de qui est entré/sorti d'un cercle, indépendamment de toute alerte.
- **`AlertParticipant`** : ce qui s'est passé pour un `LinkSentinels` donné pendant une alerte donnée (contacté, répondu, lead, réglages de messagerie au moment T, cercle figé via `circleId`/`circleName`) — remplace l'ancien `LinkSentinelAlert`, sans jamais copier l'identité (nom/téléphone restent uniquement dans `User`).
- **Étapes de l'alerte** : `Alert.launchedAt`/`activatedAt`/`closingAt`/`closedAt` — un timestamp par étape franchie, directement sur `Alert` (pas de table d'événements séparée ; ne garde que le dernier passage si une étape est revisitée).
- **`Conversation` / `ConversationParticipant` / `Message`** : fil générique, réutilisable pour n'importe quel groupe de `User` à n'importe quel moment. `alertId` (optionnel) dit juste si elle est scopée à une alerte ou pas — le "genre" de conversation (1:1 permanent, groupe 1er cercle, cercle à cercle, sentinelle isolée) n'est pas stocké : il se déduit des participants, côté backend.

Anonymisation : quand un `User` supprime son compte, `status → DELETED` + ses champs identifiants sont vidés/anonymisés, mais son `id` reste — `Message.senderId`, `AlertParticipant`, `ConversationParticipant` continuent de fonctionner sans casser l'historique.
