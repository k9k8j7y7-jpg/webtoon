CREATE DATABASE IF NOT EXISTS project_t
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE project_t;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider      ENUM('google','kakao','naver') NOT NULL,
  provider_uid  VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  display_name  VARCHAR(100),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider (provider, provider_uid)
);
