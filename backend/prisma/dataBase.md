// En résumé : PK Primary Key= "je suis identifié par ça", 
// FK Foreign Key    = "je pointe vers l'identifiant de quelqu'un d'autre".
// @unique = UK = Unique Key


//Many-to-many = jamais de FK directe, 
//toujours une table de liaison avec ses propres FK des deux côtés.

//LinkSentinels = état actuel (vivant, modifiable) 
//de qui est sentinel de qui, dans quel circle.


//LinkAlert = copie figée au moment de l'alerte (userId, circleId, 
//rôle, statut de notification) — indépendante de LinkSentinels, pour ne jamais 
//être faussée si le lien vivant change après coup.


//companion reste une FK directe sur Alert (cardinalité 1, pas besoin de table de liaison).



//HORS ALERTE
//Tout va être construit avec user, linkSentinel et Circle. C'est la base de donnée que le USer construit
// messagerie entre Companion et ses sentinelles. + status

// DURANT ALERTE
//Quand une alerte va être déclanchée, ça va copier les liens entre les sentinelles et les circles...
// disons ça copie les cerces et les sentinelles. A la fin de l'alerte, ça supprime les cercles et sentinelles non solicitées. 
// ça va travailler dessus et garder un historique
// Les messageries seront là. 

// le compagnon peut envoyer des alertes??

//Durée du vie d'une alerte?
// Info A avoir si on veut pouvoir utiliser

// ENTITY User/ Circle/ Alerte/

// delete

onDelete: Restrict
interdit la suppression si l'objet est utilisé.


onDelete: Cascade
supprimer le Circle supprime automatiquement les LinkSentinels associés.

onDelete: SetNull
supprime le Circle, mais met circleId = null dans les liens (donc circleId doit être nullable)

prisma.user.update({
  data: {
    status: "DELETED",
    deletedAt: new Date()
  }
})


est-ce que ça suffit les restriction onDelete?
Read schema.prisma
Non, il reste des trous. Voici ce que je vois dans schema.prisma :

1. Conflit potentiel Circle vs LinkSentinels sur la suppression d'un companion

Circle.companion → onDelete: Cascade (schema.prisma:220)
LinkSentinels.companion → onDelete: Restrict (schema.prisma:194)
Le commentaire ligne 193 suppose que le Cascade sur Circle supprimera les LinkSentinels avant que le Restrict ne bloque — mais Postgres ne garantit pas cet ordre entre deux contraintes FK différentes pointant vers la même ligne User. C'est fragile, pas un vrai design.

2. Relations sans onDelete explicite (défauts Prisma implicites)
Aucun onDelete n'est écrit sur :

Alert.alertBy, Alert.leadBy, Alert.closedBy, Alert.firstCircle, Alert.companion
LinkSentinelAlert.linkAsAlertSentinel
Ça retombe sur les défauts Prisma (Restrict si FK obligatoire, SetNull si optionnelle), ce qui donne un comportement globalement cohérent avec "on garde l'historique, jamais de vrai delete de User" — mais c'est implicite, pas écrit noir sur blanc, alors que le commentaire ligne 100-103 dit justement qu'aucune décision explicite n'a été prise. Ça mérite d'être explicité pour ne pas dépendre d'un défaut qu'on doit retenir par cœur.

3. Commentaire ligne 90-103 obsolète — il dit "Aucun onDelete défini nulle part", ce qui n'est plus vrai (Cascade/Restrict sont déjà posés à plusieurs endroits).

Tu veux que je corrige ces trois points directement dans le schéma ?

dataBase.md
on regarde point par point. pour Alert.alertBy, Alert.leadBy, Alert.closedBy, Alert.firstCircle, Alert.companion il faudrait setNull?
Ça dépend du champ — les FK obligatoires ne peuvent pas prendre SetNull en Prisma (le champ scalaire doit être optionnel pour ça).

alertBy (alertById String, obligatoire) → SetNull impossible sans rendre alertById optionnel. Et le rendre optionnel casserait le sens : un Alert doit toujours savoir qui l'a déclenché. → garder Restrict (explicite).
firstCircle (firstCircleId String, obligatoire) → même chose, un Alert doit toujours avoir son firstCircle. → Restrict.
companion (companionId String, obligatoire) → idem, c'est le propriétaire de l'alerte. → Restrict.
leadBy (leadById String?, optionnel) → SetNull possible et déjà le défaut. Logique : si le lead sentinel est supprimé, l'alerte garde son historique mais perd juste la référence. → SetNull (à expliciter).
closedBy (closedById String?, optionnel) → même raisonnement → SetNull (à expliciter).
Donc seulement leadBy et closedBy peuvent passer en SetNull ; les trois autres restent en Restrict par nécessité structurelle. Je les écris explicitement dans le schéma ?