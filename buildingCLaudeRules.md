
CLAUDE.md — chargé automatiquement à chaque session, pour les règles générales du projet (architecture, conventions), mémoire du projet. 
on peut aussi mettre où en en est et un petit point à la fin de chaque session pour la prochaine fois?
et des routines de sessions sur quoi commencer?
surtout si on est au milieu d'une feature. 
historique des tâches? bof bof...
@.claude/lastupdate.md

.claude/rules/
Les règles qui s'appliquent à certains fichiers/domaines. mais c'est pas méga sur... il peut contourner


Hooks (.claude/settings.json) — pour les règles non-négociables qui se déclenchent automatiquement, indépendamment de si je m'en "souviens" (ex: lancer les tests après chaque modif, bloquer une action précise techniquement). aussi comparer router api et doc api si c est ok. toujours regarder du programme à 


tests
mettre à jour avancement sur projet
avancement de la tache actuelle: plan+scope, coding, testing, debug, notes pour la prochaine fois. PR, en prod/dev/branch

Skills (.claude/skills/) — pour une "marche à suivre" réutilisable, comme ta demande sur les nouvelles features : je peux créer une skill "nouvelle-feature" qui, à chaque fois qu'on commence une feature, me fait suivre les mêmes étapes (relire plan.txt, passer en mode plan, structure du module, tests...).


==Notes Claude in action==

::/scoop (cadre) plan mode comment faire mode plan read only

/steer (diriger)::


::Claude.md::
a hard rule like never push to main belongs in a pre-tool use hook instead
don't make it too long
path:
- @.claud/convention/code-style.md
so claude also read them at launch

scope past specific conventions into rules so that they load only when they apply::

::permission::
6modes: manuel (reads only without prompting), acceptEdits, plan(read only), auto(accept everything with a classified model reviewing each action before it runs), dontAsk(only pre approved tools allowed, great for CI pipeline) bypassPermissions (dangerous)
choose: auto or dont ask



cercle reserve


faire  des tests. 

Créer et tester.

 
autre commandes
/compact + instructions:
summarize your conversation and uses that as a new context while deleting the old
ca peut enlever des trucs

/rewind
rembobiner aux derniers prompts

à voir plus tard:

règles:
principe de constructions

contrainte / vérifier / corriger.

front dans Claude XD. couleurs etc...

librean/coder = spec / pluggé par branches testables /

design sous slp iA / debug de façon scientifique

routines. quelles sont les features
qu’on peut gérer après ?

tableau avec api et info back-front

Claude
principes et bonnes pratiques.
sites où chercher doc.
