-- Differences against the bank statement recorded before they had their own source.
UPDATE `transactions` SET `source` = 'difference' WHERE `description` = 'Diferencia con el estado de cuenta' AND `source` = 'manual';
