-- Martı LMS PoC için uygulamaya özel rol ve veritabanı.
-- Uygulama süper kullanıcıyla bağlanmasın diye ayrı bir rol kullanıyoruz.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marti') THEN
    CREATE ROLE marti LOGIN PASSWORD 'marti_poc' CREATEDB;
  END IF;
END
$$;

SELECT 'CREATE DATABASE marti_lms OWNER marti'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'marti_lms')
\gexec
