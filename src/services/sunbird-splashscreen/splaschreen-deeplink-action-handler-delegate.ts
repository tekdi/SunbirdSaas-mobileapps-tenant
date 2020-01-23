import { ContentFilterConfig, PreferenceKey } from '@app/app/app.constant';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Events } from '@ionic/angular';
import { Observable, of } from 'rxjs';
import { ContentService, SharedPreferences } from 'sunbird-sdk';

import { SplashscreenActionHandlerDelegate } from './splashscreen-action-handler-delegate';
import { ContentType, MimeType, EventTopics, RouterLinks, LaunchType } from '../../app/app.constant';
import { AppGlobalService } from '../app-global-service.service';
import { TelemetryGeneratorService } from '@app/services/telemetry-generator.service';
import { CommonUtilService } from '@app/services/common-util.service';
import { PageId, InteractType, Environment, ID, CorReleationDataType } from '../telemetry-constants';


@Injectable()
export class SplaschreenDeeplinkActionHandlerDelegate implements SplashscreenActionHandlerDelegate {
  private savedUrlMatch: any;

  private _isDelegateReady = false;
  isOnboardingCompleted = '';
  // should delay the deeplinks until tabs is loaded
  set isDelegateReady(val: boolean) {
    this._isDelegateReady = val;
    if (val && this.savedUrlMatch) {
      this.checkIfOnboardingComplete(this.savedUrlMatch);
      this.savedUrlMatch = null;
    }
  }

  constructor(
    @Inject('CONTENT_SERVICE') private contentService: ContentService,
    @Inject('SHARED_PREFERENCES') private preferences: SharedPreferences,
    private telemetryGeneratorService: TelemetryGeneratorService,
    private commonUtilService: CommonUtilService,
    private appGlobalServices: AppGlobalService,
    private events: Events,
    private router: Router,
  ) { }

  onAction(payload: any): Observable<undefined> {
    if (payload && payload.url) {
      const quizTypeRegex = new RegExp(/(?:\/resources\/play\/content\/(?<quizId>\w+))/);
      const dialTypeRegex = new RegExp(/(?:\/(?:dial|QR)\/(?<dialCode>\w+))/);
      const contentTypeRegex = new RegExp(/(?:\/play\/(?:content|collection)\/(?<contentId>\w+))/);
      const courseTypeRegex = new RegExp(/(?:\/(?:explore-course|learn)\/course\/(?<courseId>\w+))/);

      const urlRegex = new RegExp(quizTypeRegex.source + '|' + dialTypeRegex.source + '|' +
        contentTypeRegex.source + '|' + courseTypeRegex.source);
      const urlMatch = payload.url.match(urlRegex.source);

      if (urlMatch && urlMatch.groups) {
        this.checkIfOnboardingComplete(urlMatch);
      }
    }
    return of(undefined);
  }

  async checkIfOnboardingComplete(urlMatch) {
    if (!this.isOnboardingCompleted) {
      this.isOnboardingCompleted = await this.preferences.getString(PreferenceKey.IS_ONBOARDING_COMPLETED).toPromise();
    }
    if (this.isOnboardingCompleted) {
      this.handleNavigation(urlMatch);
    }
  }

  private handleNavigation(urlMatch: any): void {
    if (this._isDelegateReady) {
      if (urlMatch.groups.dialCode) {
        this.router.navigate([RouterLinks.SEARCH], { state: { dialCode: urlMatch.groups.dialCode, source: PageId.HOME } });
      } else if (urlMatch.groups.quizId || urlMatch.groups.contentId || urlMatch.groups.courseId) {
        this.navigateContent(urlMatch.groups.quizId || urlMatch.groups.contentId || urlMatch.groups.courseId, true);
      }
    } else {
      this.savedUrlMatch = urlMatch;
    }
  }

  async navigateContent(identifier, isFromLink = false) {
    try {
      this.appGlobalServices.resetSavedQuizContent();
      const content = await this.contentService.getContentDetails({
        contentId: identifier
      }).toPromise();

      if (isFromLink) {
        this.telemetryGeneratorService.generateAppLaunchTelemetry(LaunchType.DEEPLINK);
      }

      if (content.contentType === ContentType.COURSE.toLowerCase()) {
        this.router.navigate([RouterLinks.ENROLLED_COURSE_DETAILS], { state: { content } });
      } else if (content.mimeType === MimeType.COLLECTION) {
        this.router.navigate([RouterLinks.COLLECTION_DETAIL_ETB], { state: { content } });
      } else {
        if (!this.commonUtilService.networkInfo.isNetworkAvailable) {
          this.commonUtilService.showToast('NEED_INTERNET_FOR_DEEPLINK_CONTENT');
          return;
        }
        if (content.contentData && content.contentData.status === ContentFilterConfig.CONTENT_STATUS_UNLISTED) {
          this.navigateQuizContent(identifier, content, isFromLink);
        } else {
          await this.router.navigate([RouterLinks.CONTENT_DETAILS], { state: { content } });
        }
      }
    } catch (err) { }
  }

  private async navigateQuizContent(identifier, content, isFromLink) {
    this.appGlobalServices.limitedShareQuizContent = identifier;
    if (isFromLink) {
      this.limitedSharingContentLinkClickedTelemery();
    }
    if (!this.appGlobalServices.isSignInOnboardingCompleted && this.appGlobalServices.isUserLoggedIn()) {
      return;
    }
    if (this.router.url && this.router.url.indexOf(RouterLinks.CONTENT_DETAILS) !== -1) {
      this.events.publish(EventTopics.DEEPLINK_CONTENT_PAGE_OPEN, { content, autoPlayQuizContent: true });
      return;
    }
    await this.router.navigate([RouterLinks.CONTENT_DETAILS], { state: { content, autoPlayQuizContent: true } });
  }

  private limitedSharingContentLinkClickedTelemery(): void {
    const corRelationList = [];
    corRelationList.push({ id: ID.QUIZ, type: CorReleationDataType.DEEPLINK });
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.QUIZ_DEEPLINK,
      '',
      Environment.HOME,
      undefined,
      undefined,
      undefined,
      undefined,
      corRelationList,
      ID.DEEPLINK_CLICKED
    );
  }

}
