import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getServices, openRouterApiKey } from '../../composition-root';
import { requireAdmin } from '../../security/auth-guard';
import { isRunningInEmulator } from '../../security/environment';
import { ProjectNotDraftError, ProjectNotFoundError } from '../../services/idea-intake.service';

export const approveProjectDraft = onCall(
  { secrets: [openRouterApiKey], enforceAppCheck: !isRunningInEmulator, cors: true },
  async (request) => {
    requireAdmin(request);
    const projectId = request.data?.projectId;
    if (typeof projectId !== 'string' || !projectId) {
      throw new HttpsError('invalid-argument', 'projectId is required.');
    }

    const { ideaIntakeService } = getServices();
    try {
      return await ideaIntakeService.approveDraft(projectId);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) throw new HttpsError('not-found', 'Project not found.');
      if (err instanceof ProjectNotDraftError) throw new HttpsError('failed-precondition', 'Project is not in draft status.');
      throw err;
    }
  }
);
