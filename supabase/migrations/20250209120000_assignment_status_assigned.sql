-- Standardize assignment_statuses to use key 'assigned' (not 'offered').
-- Accept/Decline buttons use 'accepted' and 'declined'; ensure no 'offered' remains.

UPDATE public.assignment_statuses
SET key = 'assigned', label = COALESCE(NULLIF(label, ''), 'Assigned')
WHERE key = 'offered';
