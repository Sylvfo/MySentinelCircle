CLAUDE.md — chargé automatiquement à chaque session, pour les règles générales du projet (architecture, conventions), mémoire du projet. 
on peut aussi mettre où en en est et un petit point à la fin de chaque session pour la prochaine fois?
et des routines de sessions sur quoi commencer?
surtout si on est au milieu d'une feature. 
historique des tâches? bof bof...


.claude/rules/
Les règles qui s'appliquent à certains fichiers/domaines. mais c'est pas méga sur... il peut contourner


Permissions (.claude/settings.json) — pour les droits : quoi je peux faire sans demander, quoi doit toujours demander confirmation, quoi est totalement interdit. On vient de commencer.
ça c'est sur
allow → fais-le sans me demander
ask   → demande-moi avant
deny  → interdit

{
  "permissions": {
    "deny": [
      "Edit(prisma/schema.prisma)"
    ]
  }
}

Hooks (.claude/settings.json) — pour les règles non-négociables qui se déclenchent automatiquement, indépendamment de si je m'en "souviens" (ex: lancer les tests après chaque modif, bloquer une action précise techniquement). aussi comparer router api et doc api si c est ok. toujours regarder du programme à 


tests
mettre à jour avancement sur projet
avancement de la tache actuelle: plan+scope, coding, testing, debug, notes pour la prochaine fois. PR, en prod/dev/branch


les schéma
la liste des données entre le front et le back et où elles sont vérifiées.

S

Skills (.claude/skills/) — pour une "marche à suivre" réutilisable, comme ta demande sur les nouvelles features : je peux créer une skill "nouvelle-feature" qui, à chaque fois qu'on commence une feature, me fait suivre les mêmes étapes (relire plan.txt, passer en mode plan, structure du module, tests...).


Notes sur comment on va construire les trucs autours:

mode plan

Mode plan — le plus rentable comme tu dis. Dès qu'on attaque un module NestJS (alert, sentinel...), passer par le mode plan pour que tu valides l'approche avant que j'écrive du code, exactement comme on a fait pour le schéma DB aujourd'hui mais formalisé. Direct applicable.

plan.txt



==Notes Claude in action==

::/scoop (cadre) plan mode comment faire mode plan read only

/steer (diriger)::


::Claude.md::
a hard rule like never push to main belongs in a pre-tool use hook instead
don't make it too long
path:
- @.claud/convention/code-style.md
so claude also read them at launch
put new api routes and source API handle, one per file

scope past specific conventions into rules so that they load only when they apply::

::permission::
6modes: manuel (reads only without prompting), acceptEdits, plan(read only), auto(accept everything with a classified model reviewing each action before it runs), dontAsk(only pre approved tools allowed, great for CI pipeline) bypassPermissions (dangerous)
choose: auto or dont ask


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

autre commandes
/compact + instructions:
summarize your conversation and uses that as a new context while deleting the old
ca peut enlever des trucs

/rewind
rembobiner aux derniers prompts

à voir plus tard:

règles:
quand demande de commande mettre si c'est que read ou si il veut modifier qqch et explique ce que ça fait. 

