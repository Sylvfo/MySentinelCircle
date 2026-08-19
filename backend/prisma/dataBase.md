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


//regles IA:
quels fichiers toucher et pas toucher??
pas toucher db.
dire à chaque session si bien enregistré les règles

rules backend:

CircleAlert et LinkSentinelAlert utilisés ne doivent jamais être supprimés après CLOSING

fais des réponses courtes ok?

ne pas toucher à la db et constuire surla DB

cercle reserve

mode manuel de claude pour validations.

écrit de façon courte et claire.

si un élément d une to do liste à été fait, supprime là.

faire  des tests. 

Créer et tester.

Pas à pas avec 

AlertNotification

permission claude dans 