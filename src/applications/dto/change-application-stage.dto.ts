import { IsIn } from 'class-validator';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class ChangeApplicationStageDto {
  @IsIn([...APPLICATION_STAGES])
  stage: ApplicationStage;
}
