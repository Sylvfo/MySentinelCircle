## Database Schema

> Reflète l'état actuel de `schema.prisma` (branche `data_base_definition`).

Modèles actifs : `User`, `Circle`, `Alert`, `LinkSentinels`, `CircleAlert`, `LinkSentinelAlert`, `Conversation`, `Message`.
Organization et tout ce qui en dépend sont encore en commentaire dans le fichier, pas dans la DB.

```mermaid
erDiagram
  User               ||--o{ Circle             : "companion (MyCirclesAsCompanion)"
  User               ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User               ||--o{ LinkSentinels      : "companion (SentinelCompanion)"
  User               ||--o{ LinkSentinels      : "sentinel (LinkAsSentinel)"
  User               ||--o{ LinkSentinelAlert  : "sentinel (SentinelAlerts)"
  User               ||--o{ Message            : "sender (sentMessages)"
  Circle             ||--o{ LinkSentinels      : "circle (Cascade)"
  Alert              ||--o{ CircleAlert        : "alert (MyCirclesDuringAlerte)"
  CircleAlert        ||--||  Alert             : "firstCircle (1-1)"
  CircleAlert        ||--o{ LinkSentinelAlert  : "circle"
  LinkSentinelAlert  ||--o{ Alert              : "alertBy? / leadBy? / closedBy?"
  LinkSentinels      |o--o| Conversation       : "conversation?"
  CircleAlert        |o--o| Conversation       : "conversation?"
  LinkSentinelAlert  |o--o| Conversation       : "conversation?"
  Conversation       ||--o{ Message            : "messages"

  User {
    string id PK
    string firstName
    string userName UK
    string email UK
    string phone UK
    string googleId UK
    enum   status
    enum   userType
    boolean hasPaid
  }

  Circle {
    string id PK
    string label
    string status
    enum   circleType
    string companionId FK
  }

  Alert {
    string id PK
    string label
    string messageAlert
    enum   alertStatus
    enum   alertType
    string companionId FK
    string firstCircleId FK "UK"
    string alertById FK "optional"
    string leadById FK "optional"
    string closedById FK "optional"
  }

  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    string circleId FK
    enum   status
    enum   sentinelType
    enum   initiatedBy
    boolean is1Circle
    enum   leadSlot
    string conversationId FK "optional, UK"
  }

  CircleAlert {
    string id PK
    string label
    boolean isPrimary
    enum   circleStatus
    boolean wasContacted
    string sourceCircleId
    string companionId
    string alertId FK
    string conversationId FK "optional, UK"
  }

  LinkSentinelAlert {
    string id PK
    string firstName
    string phone
    enum   sentinelType
    enum   sentinelStatus
    boolean contacted
    string alertId FK
    string alertSentinelId FK
    string circleAlertId FK
    string conversationId FK "optional, UK"
  }

  Conversation {
    string id PK
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

Ce que `User` touche quand il agit **comme sentinelle** (surveillé/protégé par personne, mais protège/veille sur d'autres) : ses liens vers des cercles qu'il ne possède pas, son historique dans les alertes des autres, et les fils de discussion qui en découlent.

```mermaid
erDiagram
  User               ||--o{ LinkSentinels     : "sentinel (LinkAsSentinel)"
  LinkSentinels      }o--||  Circle           : "circle (Cascade)"
  LinkSentinels      |o--o| Conversation      : "conversation?"
  User               ||--o{ LinkSentinelAlert : "sentinel (SentinelAlerts)"
  LinkSentinelAlert  }o--||  CircleAlert      : "circle"
  LinkSentinelAlert  |o--o| Conversation      : "conversation?"
  CircleAlert        }o--||  Alert            : "alert (MyCirclesDuringAlerte)"
  Conversation       ||--o{ Message           : "messages"

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
  LinkSentinelAlert {
    string id PK
    string alertSentinelId FK
    string circleAlertId FK
    string alertId FK
    enum   sentinelStatus
    boolean contacted
  }
  CircleAlert {
    string id PK
    string alertId FK
    boolean wasContacted
  }
  Alert {
    string id PK
    string companionId FK
  }
  Conversation {
    string id PK
  }
  Message {
    string id PK
    string senderId FK
  }
```

- `LinkAsSentinel` : les cercles où ce `User` est enregistré comme sentinelle (`LinkSentinels.sentinelId`).
- `SentinelAlerts` : l'historique figé (`LinkSentinelAlert`) de toutes les alertes où ce `User` a été sollicité comme sentinelle. Pour remonter jusqu'à l'`Alert`, il faut passer par `CircleAlert` (deux sauts).

## Vue "Companion"

Ce que `User` touche quand il agit **comme companion** (celui qui est protégé, propriétaire de ses cercles et de ses alertes).

```mermaid
erDiagram
  User          ||--o{ Circle             : "companion (MyCirclesAsCompanion)"
  User          ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User          ||--o{ LinkSentinels      : "companion (SentinelCompanion)"
  Circle        ||--o{ LinkSentinels      : "circle (Cascade)"
  LinkSentinels |o--o| Conversation       : "conversation?"
  Alert         ||--o{ CircleAlert        : "alert (MyCirclesDuringAlerte)"
  CircleAlert   ||--||  Alert             : "firstCircle (1-1)"
  CircleAlert   |o--o| Conversation       : "conversation?"
  CircleAlert   ||--o{ LinkSentinelAlert  : "circle"
  LinkSentinelAlert |o--o| Conversation   : "conversation?"
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
  Alert {
    string id PK
    string messageAlert
    enum   alertStatus
    enum   alertType
    string companionId FK
    string firstCircleId FK "UK"
  }
  LinkSentinels {
    string id PK
    string sentinelId FK
    string companionId FK
    string circleId FK
    enum   status
  }
  CircleAlert {
    string id PK
    string label
    boolean isPrimary
    boolean wasContacted
    string alertId FK
  }
  LinkSentinelAlert {
    string id PK
    string alertSentinelId FK
    string circleAlertId FK
  }
  Conversation {
    string id PK
  }
  Message {
    string id PK
    string senderId FK
  }
```

- `MyCirclesAsCompanion` : les cercles que ce `User` possède (`Circle.companionId`).
- `MyAlertsAsCompanion` : les alertes que ce `User` a déclenchées (`Alert.companionId`).
- Chaque `Circle` possédé expose ses `sentinelLinks` — qui a été invité/accepté dedans, avec quel statut.
- Chaque `Alert` déclenchée expose ses `myCircles: CircleAlert[]` — la photo figée de tous les cercles au moment du déclenchement, plus `firstCircle: CircleAlert` — celui d'entre eux désigné comme premier cercle sollicité. Chaque `CircleAlert` expose à son tour ses `sentinels: LinkSentinelAlert[]`.

---

## Légende — les différents types de liens

- **`LinkSentinels`** : lien *vivant* User↔Circle (qui est sentinelle, dans quel cercle, avec quel statut). Modifiable tant que le lien existe.
- **`CircleAlert`** : *copie figée* d'un `Circle` au moment où une alerte se déclenche — garde son propre historique (contacté, statut...) indépendamment du cercle vivant, qui peut changer ou disparaître après coup.
- **`LinkSentinelAlert`** : *copie figée* d'un `LinkSentinels` au moment de l'alerte — qui était sentinelle, avec ses infos copiées telles quelles (nom, téléphone...), indépendante du lien vivant pour ne jamais être faussée si celui-ci change après l'alerte.
- **`Conversation` / `Message`** : fil de discussion générique et réutilisé, rattaché (via un `conversationId` optionnel et unique) à l'un de ces trois parents : `LinkSentinels` (1:1 Me↔Sentinel hors alerte), `CircleAlert` (groupe du 1er cercle pendant l'alerte, si `isPrimary`), ou `LinkSentinelAlert` (chat isolé sentinel↔1er cercle pendant l'alerte). Un seul modèle pour les 3 contextes — pas de `type` stocké, le parent qui porte le `conversationId` fait foi.

---

## Schéma "avant alerte"

Le monde vivant, tel qu'il existe tant qu'aucune alerte n'est déclenchée : cercles, liens sentinelles, et la messagerie 1:1 Me↔Sentinel qui va avec.

```mermaid
erDiagram
  User          ||--o{ Circle        : "companion (MyCirclesAsCompanion)"
  User          ||--o{ LinkSentinels : "companion (SentinelCompanion)"
  User          ||--o{ LinkSentinels : "sentinel (LinkAsSentinel)"
  Circle        ||--o{ LinkSentinels : "circle (Cascade)"
  LinkSentinels |o--o| Conversation  : "conversation?"
  Conversation  ||--o{ Message       : "messages"
  User          ||--o{ Message       : "sender (sentMessages)"

  User {
    string id PK
    string firstName
    string phone UK
    enum   status
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
    string circleId FK
    enum   status
    enum   sentinelType
    enum   initiatedBy
    boolean is1Circle
    enum   leadSlot
    string conversationId FK "optional, UK"
  }
  Conversation {
    string id PK
  }
  Message {
    string id PK
    string body
    enum   type
    string senderId FK
  }
```

Rien ici n'est jamais supprimé "en vrac" au déclenchement d'une alerte : c'est justement pour que ces données puissent continuer à changer librement (le lien peut être modifié, la sentinelle peut partir) que tout ce qui suit est une *copie figée*, pas une référence directe.

## Schéma "pendant alerte"

Ce qui se déclenche et existe une fois une alerte lancée : la photo figée des cercles/sentinelles au moment T, plus les chats scopés à cette alerte.

```mermaid
erDiagram
  User               ||--o{ Alert              : "companion (MyAlertsAsCompanion)"
  User               ||--o{ LinkSentinelAlert  : "sentinel (SentinelAlerts)"
  Alert              ||--o{ CircleAlert        : "alert (MyCirclesDuringAlerte)"
  CircleAlert        ||--||  Alert             : "firstCircle (1-1)"
  CircleAlert        ||--o{ LinkSentinelAlert  : "circle"
  LinkSentinelAlert  ||--o{ Alert              : "alertBy? / leadBy? / closedBy?"
  CircleAlert        |o--o| Conversation       : "conversation?"
  LinkSentinelAlert  |o--o| Conversation       : "conversation?"
  Conversation       ||--o{ Message            : "messages"
  User               ||--o{ Message            : "sender (sentMessages)"

  User {
    string id PK
  }
  Alert {
    string id PK
    string label
    string messageAlert
    enum   alertStatus
    enum   alertType
    string companionId FK
    string firstCircleId FK "UK"
    string alertById FK "optional"
    string leadById FK "optional"
    string closedById FK "optional"
  }
  CircleAlert {
    string id PK
    string label
    boolean isPrimary
    enum   circleStatus
    boolean wasContacted
    string sourceCircleId
    string alertId FK
    string conversationId FK "optional, UK"
  }
  LinkSentinelAlert {
    string id PK
    string firstName
    string phone
    enum   sentinelType
    enum   sentinelStatus
    boolean contacted
    string alertId FK
    string alertSentinelId FK
    string circleAlertId FK
    string conversationId FK "optional, UK"
  }
  Conversation {
    string id PK
  }
  Message {
    string id PK
    string body
    enum   type
    string senderId FK
  }
```

`alertById`/`leadById`/`closedById` pointent vers `LinkSentinelAlert` (pas `User`) et sont tous optionnels — `alertType = BYCOMPANION` (le/la companion s'auto-alerte) n'a pas de sentinelle déclenchante, donc `alertById` reste `null` dans ce cas.
