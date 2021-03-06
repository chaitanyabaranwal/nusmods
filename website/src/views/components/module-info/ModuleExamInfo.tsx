import * as React from 'react';

import { SemesterDataCondensed } from 'types/modules';

import config from 'config';
import { formatExamDate } from 'utils/modules';
import { BULLET } from 'utils/react';

interface Props {
  semesterData: SemesterDataCondensed;
}

const ModuleExamInfo: React.FC<Props> = ({ semesterData }) =>
  config.examAvailabilitySet.has(semesterData.semester) ? (
    <p>
      {formatExamDate(semesterData.examDate)}{' '}
      {semesterData.examDuration && `${BULLET} ${semesterData.examDuration / 60} hrs`}
    </p>
  ) : (
    <p>Exam date not yet available</p>
  );

export default ModuleExamInfo;
