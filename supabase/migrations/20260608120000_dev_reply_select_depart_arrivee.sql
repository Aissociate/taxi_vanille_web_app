/*
  # Reponse developpeur + cloture proposition "selection depart/arrivee"

  Suite a la demande de daf sur la proposition de memorisation des choix de course
  ("Serait il possible de selectionner le point de depart et le point d'arrivee
  plutot que de le saisir ?"), la fonctionnalite a ete implementee dans le
  formulaire de creation/edition de course (PlanningPage) : les arrets et terminus
  de la ligne choisie sont proposes dans une liste deroulante, la saisie libre
  restant possible.

  Cette migration :
    1. Ajoute la reponse du developpeur dans le fil de la proposition
       (en reutilisant le user_id du dev deja present sur ce fil).
    2. Passe la proposition au statut "done" (Termine).

  Idempotent : la reponse n'est inseree que si elle n'existe pas deja.
*/

INSERT INTO proposal_responses (proposal_id, user_id, message, is_dev)
SELECT p.id,
       (SELECT pr.user_id
          FROM proposal_responses pr
         WHERE pr.proposal_id = p.id AND pr.is_dev = true
         ORDER BY pr.created_at DESC
         LIMIT 1),
       'Implemente. Vous pouvez desormais selectionner le point de depart et le point d''arrivee directement dans une liste deroulante : les arrets et le terminus de la ligne choisie sont proposes automatiquement. La saisie libre reste possible pour un point hors ligne.',
       true
FROM dev_proposals p
WHERE p.titre ILIKE '%Maintenir les choix%course%'
  AND EXISTS (
        SELECT 1 FROM proposal_responses pr
         WHERE pr.proposal_id = p.id AND pr.is_dev = true
      )
  AND NOT EXISTS (
        SELECT 1 FROM proposal_responses pr
         WHERE pr.proposal_id = p.id
           AND pr.message LIKE 'Implemente. Vous pouvez desormais selectionner le point de depart%'
      );

UPDATE dev_proposals
   SET statut = 'done'
 WHERE titre ILIKE '%Maintenir les choix%course%';
