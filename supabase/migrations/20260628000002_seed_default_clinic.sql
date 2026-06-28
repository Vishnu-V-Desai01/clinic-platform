-- Ensure the hardcoded default clinic record exists.
-- ON CONFLICT DO NOTHING makes this safe to run multiple times.
INSERT INTO clinics (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'My Clinic')
ON CONFLICT (id) DO NOTHING;