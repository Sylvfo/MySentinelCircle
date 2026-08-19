## Database Schema

> Reflète l'état actuel de `schema.prisma` (branche `data_base_definition`).

Modèles actifs : `User`, `Circle`, `LinkSentinels`, `LinkSentinelsEvent`, `Alert`, `AlertParticipant`, `AlertEvent`, `Conversation`, `ConversationParticipant`, `Message`.
Principe central : rien n'est jamais vraiment supprimé — `User`/`Circle`/`LinkSentinels` se ferment ou s'anonymisent, mais restent référençables pour toujours. Plus de tables-copies (`CircleAlert`/`LinkSentinelAlert` ont disparu).

```mermaid
erDiagram
  User               ||--o{ Circle                   : "companion (MyCirclesAsCompanion)"
  User               ||--o{ LinkSentinels            : "companion (SentinelCompanion)"
  User               ||--o{ LinkSentinels            : "sentinel (LinkAsSentinel)"
  User               ||--o{ Alert                    : "companion (MyAlertsAsCompanion)"
  User               ||--o{ Alert                    : "launchedBy? / closedBy?"
  User               ||--o{ AlertEvent               : "actor?"
  User               ||--o{ ConversationParticipant  : "user"
  User               ||--o{ Message                  : "sender"
  Circle             ||--o{ LinkSentinels             : "circle"
  Circle             ||--o{ Alert                     : "firstCircle"
  LinkSentinels      ||--o{ LinkSentinelsEvent        : "events"
  LinkSentinels      ||--o{ AlertParticipant          : "alertParticipations"
  LinkSentinels      |o--o| Conversation              : "conversation?"
  Alert              ||--o{ AlertParticipant          : "participants"
  Alert              ||--o{ AlertEvent                : "events"
  Alert              ||--o{ Conversation              : "conversations"
  AlertParticipant   |o--o| Conversation              : "privateConversation?"
  AlertParticipant   ||--o{ AlertEvent                : "events"
  Conversation        ||--o{ ConversationParticipant  : "participants"
  Conversation        ||--o{ Message                  : "messages"
  Conversation        ||--o{ AlertEvent               : "events"

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
    string companionId FK
    string firstCircleId FK
    string launchedById FK "optional"
    string closedById FK "optional"
  }

  AlertParticipant {
    string id PK
    string alertId FK
    string linkSentinelsId FK
    enum   status
    boolean isLead
    boolean canSendPhoneAtAlert
  }

  AlertEvent {
    string id PK
    string alertId FK
    enum   type
    string actorId FK "optional"
    string participantId FK "optional"
    string conversationId FK "optional"
  }

  Conversation {
    string id PK
    enum   type
    string linkSentinelsId FK "optional, UK"
    string alertId FK "optional"
    string alertParticipantId FK "optional, UK"
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
  LinkSentinels     |o--o| Conversation       : "conversation?"
  LinkSentinels     ||--o{ AlertParticipant   : "alertParticipations"
  AlertParticipant  }o--||  Alert             : "alert"
  AlertParticipant  |o--o| Conversation       : "privateConversation?"
  Conversation      ||--o{ Message            : "messages"

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
    enum   status
    boolean isLead
  }
  Alert {
    string id PK
    string companionId FK
  }
  Conversation {
    string id PK
    enum   type
  }
  Message {
    string id PK
    string senderId FK
  }
```

- `LinkAsSentinel` : les cercles où ce `User` est enregistré comme sentinelle.
- `alertParticipations` : l'historique de toutes les alertes où ce `User` a été sollicité — via son `LinkSentinels`, sans copier son identité.

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
  LinkSentinels |o--o| Conversation       : "conversation?"
  Alert         ||--o{ AlertParticipant   : "participants"
  Alert         ||--o{ Conversation       : "conversations"
  Alert         ||--o{ AlertEvent         : "events"
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
    string companionId FK
    string firstCircleId FK
  }
  AlertParticipant {
    string id PK
    string linkSentinelsId FK
    enum   status
  }
  AlertEvent {
    string id PK
    enum   type
  }
  Conversation {
    string id PK
    enum   type
  }
  Message {
    string id PK
    string senderId FK
  }
```

- `MyCirclesAsCompanion` : les cercles que ce `User` possède.
- `MyAlertsAsCompanion` : les alertes que ce `User` a déclenchées.
- `firstCircle` sur `Alert` pointe directement sur `Circle` (permanent) — plus besoin de snapshot.

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
  LinkSentinels |o--o| Conversation        : "conversation?"
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
  Conversation {
    string id PK
    enum   type "DIRECT"
  }
  Message {
    string id PK
    string body
    string senderId FK
  }
```

Chaque transition de statut (`PENDING→ACCEPTED`, `ACCEPTED→REMOVED`...) crée une ligne `LinkSentinelsEvent` — c'est la seule trace d'historique hors alerte, et elle sert aussi de déclencheur de notification ("Anna a quitté ton 1er cercle").

## Schéma "pendant alerte"

Ce qui se déclenche une fois une alerte lancée : qui a participé (référence directe au lien permanent, pas de copie), la timeline, et les chats scopés à l'alerte.

```mermaid
erDiagram
  User               ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User               ||--o{ Alert              : "launchedBy? / closedBy?"
  Circle             ||--o{ Alert              : "firstCircle"
  Alert              ||--o{ AlertParticipant   : "participants"
  Alert              ||--o{ AlertEvent         : "events"
  Alert              ||--o{ Conversation       : "conversations"
  LinkSentinels      ||--o{ AlertParticipant   : "alertParticipations"
  AlertParticipant   |o--o| Conversation       : "privateConversation?"
  AlertParticipant   ||--o{ AlertEvent         : "events"
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
    enum   status
    boolean isLead
    boolean canSendPhoneAtAlert
  }
  AlertEvent {
    string id PK
    enum   type
    datetime createdAt
  }
  Conversation {
    string id PK
    enum   type "FIRST_CIRCLE_GROUP / CIRCLE_TO_CIRCLE / FIRST_CIRCLE_SENTINEL"
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

`AlertParticipant.linkSentinelsId` est obligatoire — il pointe toujours sur le lien vivant, jamais une copie. Le cas "companion s'auto-alerte" (`AlertType.BYCOMPANION`) n'a pas besoin de `AlertParticipant` : `Alert.launchedBy` pointe directement sur `User`.

---

## Légende — les différents mécanismes d'historique

- **`LinkSentinels`** : lien vivant User↔Circle, une seule ligne par paire, jamais supprimée — juste son `status` change (`PENDING`/`ACCEPTED`/`REMOVED`/`BLOCKED`...).
- **`LinkSentinelsEvent`** : journal append-only de chaque transition de statut — trace minimale de qui est entré/sorti d'un cercle, indépendamment de toute alerte.
- **`AlertParticipant`** : ce qui s'est passé pour un `LinkSentinels` donné pendant une alerte donnée (contacté, répondu, lead, réglages de messagerie au moment T) — remplace l'ancien `LinkSentinelAlert`, sans jamais copier l'identité (nom/téléphone restent uniquement dans `User`).
- **`AlertEvent`** : timeline chronologique de l'alerte elle-même (lancement, contact, réponse, lead assigné, changement de statut, clôture...), typée (`AlertEventType`) et distincte des messages.
- **`Conversation` / `ConversationParticipant` / `Message`** : fil générique et réutilisé pour les 4 types (`ConversationType`) :
  - `DIRECT` : companion ↔ un sentinel, permanent, toujours exactement 2 participants (jamais de groupe, pour protéger la personne) — ancré via `LinkSentinels.conversation` (1-1).
  - `FIRST_CIRCLE_GROUP` : le groupe du 1er cercle pendant une alerte.
  - `CIRCLE_TO_CIRCLE` : le 1er cercle interroge un autre cercle.
  - `FIRST_CIRCLE_SENTINEL` : chat isolé entre le 1er cercle et une sentinelle active — ancré via `AlertParticipant.privateConversation` (1-1).

Anonymisation : quand un `User` supprime son compte, `status → DELETED` + ses champs identifiants sont vidés/anonymisés, mais son `id` reste — `Message.senderId`, `AlertParticipant`, `ConversationParticipant` continuent de fonctionner sans casser l'historique.
