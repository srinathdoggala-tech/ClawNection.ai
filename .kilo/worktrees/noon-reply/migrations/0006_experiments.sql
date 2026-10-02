-- Tag every date with the experiment cohort and model that produced it,
-- so analyze-experiment.mjs can group dates by condition. Both columns
-- nullable — production / classmate dates leave them blank.

ALTER TABLE virtual_dates ADD COLUMN experiment_cohort TEXT;
ALTER TABLE virtual_dates ADD COLUMN subject_model     TEXT;

CREATE INDEX IF NOT EXISTS idx_virtual_dates_experiment_cohort
  ON virtual_dates(experiment_cohort);
