-- Rolü CAPTAIN yerine USER olarak adlandırıyoruz.
-- RENAME VALUE, enum değerinin OID'sini koruduğu için mevcut satırlar ve
-- User.role sütunundaki varsayılan değer olduğu gibi taşınır; veri kaybı olmaz.
ALTER TYPE "Role" RENAME VALUE 'CAPTAIN' TO 'USER';
