import { Location } from '@angular/common';
import { Component, Inject, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup,Validators,AbstractControl, ValidationErrors, ValidatorFn  } from '@angular/forms';
import { NavigationExtras, Router } from '@angular/router';
import { featureIdMap } from '@app/feature-id-map';
import { AppGlobalService, AppHeaderService, CommonUtilService, FormAndFrameworkUtilService } from '@app/services';
import { FormLocationFactory } from '@app/services/form-location-factory/form-location-factory';
import { LocationHandler } from '@app/services/location-handler';
import { ProfileHandler } from '@app/services/profile-handler';
import {
  AuditType, CorReleationDataType, Environment,
  ID, ImpressionType,
  InteractSubtype,
  InteractType,
  PageId
} from '@app/services/telemetry-constants';
import { TelemetryGeneratorService } from '@app/services/telemetry-generator.service';
import { Platform } from '@ionic/angular';
import { Events } from '@app/util/events';
import { Location as SbLocation } from '@project-sunbird/client-services/models/location';
import { FieldConfig } from 'common-form-elements';
import { concat, defer, of, Subscription } from 'rxjs';
import { delay, distinctUntilChanged, filter, mergeMap, pairwise, take, tap } from 'rxjs/operators';
import {
  AuditState, CorrelationData, DeviceInfo, DeviceRegisterRequest,
  DeviceRegisterService,
  FormRequest, LocationSearchResult, Profile, ProfileService,
  SharedPreferences
} from 'sunbird-sdk';
import { LocationConfig, PreferenceKey, ProfileConstants, RegexPatterns, RouterLinks } from '../../app/app.constant';
import { FormConstants } from '../form.constants';
import {ProfileType} from '@project-sunbird/sunbird-sdk';
import { TncUpdateHandlerService } from '@app/services/handlers/tnc-update-handler.service';
import { ExternalIdVerificationService } from '@app/services/externalid-verification.service';
import { KendraApiService } from '../manage-learn/core/services/kendra-api.service';
import { urlConstants } from '../manage-learn/core/constants/urlConstants';
interface LocationData {
  school?: any;
  cluster?: any;
  block?: any;
  district?: any;
  state?: any;
}
@Component({
  selector: 'app-district-mapping1',
  templateUrl: './district-mapping1.page.html',
  styleUrls: ['./district-mapping1.page.scss'],
})
export class DistrictMapping1Page implements OnDestroy {
  get isShowBackButton(): boolean {
    if (window.history.state.isShowBackButton === undefined) {
      return true;
    }
    return window.history.state.isShowBackButton;
  }
  get source() {
    return window.history.state.source;
  }
  formGroup: FormGroup;
   btnColor = '#8FC4FF';
  showNotNowFlag = false;
  locationFormConfig: FieldConfig<any>[] = [];
  profile?: Profile;
  navigateToCourse = 0;
  isGoogleSignIn = false;
  userData: any;
  locationdata: LocationData = {};
  selectedRole:any;
  selectedSubRole:any;
  admin :boolean=false;
  role: boolean=false;
  button:boolean=false;
  udisetext:boolean=false;
  private backButtonFunc: Subscription;
  private presetLocation: { [locationType: string]: LocationSearchResult } = {};
  private loader?: any;
  private stateChangeSubscription?: Subscription;
  private prevFormValue: any = {};
  private formValueSubscription?: Subscription;
  private initialFormLoad = true;
  private isLocationUpdated = false;
   params;

  constructor(
    @Inject('PROFILE_SERVICE') private profileService: ProfileService,
    @Inject('SHARED_PREFERENCES') private preferences: SharedPreferences,
    @Inject('DEVICE_REGISTER_SERVICE') private deviceRegisterService: DeviceRegisterService,
    @Inject('DEVICE_INFO') public deviceInfo: DeviceInfo,
    public headerService: AppHeaderService,
    public commonUtilService: CommonUtilService,
    private formAndFrameworkUtilService: FormAndFrameworkUtilService,
    public router: Router,
    public location: Location,
    public appGlobalService: AppGlobalService,
    public events: Events,
    public platform: Platform,
    public telemetryGeneratorService: TelemetryGeneratorService,
    private formLocationFactory: FormLocationFactory,
    private locationHandler: LocationHandler,
    private profileHandler: ProfileHandler,
    private tncUpdateHandlerService: TncUpdateHandlerService,
    private externalIdVerificationService: ExternalIdVerificationService,
    private fb: FormBuilder,
    private kendraService: KendraApiService
  ) {
    this.appGlobalService.closeSigninOnboardingLoader();
    const extrasState = this.router.getCurrentNavigation().extras.state;
    this.navigateToCourse = extrasState.noOfStepsToCourseToc;
    this.isGoogleSignIn = extrasState.isGoogleSignIn;
    this.userData = this.isGoogleSignIn ? extrasState.userData : '';
     this.params = extrasState.payload;
  }

  ngOnInit() {
    this.formGroup = this.fb.group({
      // udisecode: ['', [Validators.required, this.udisecodeValidator()]],
      udisecode: ['', [Validators.required]], // Use an array for multiple validators
      name: this.fb.group({}),
      children: this.fb.group({
        persona: this.fb.group({})
      })
    });
    
  }
  // udisecodeValidator(): ValidatorFn {
  //   return (control: AbstractControl): ValidationErrors | null => {
  //     const value = control.value;
  //     if (value && value.length !> 11 ) {
  //       return { 'udisecodeInvalid': true };
  //     }
  //     return null;
  //   };
  // }
  // isFormValid(): boolean {
  //   return this.formGroup.valid;
  // }

  goBack(isNavClicked: boolean) {
    this.telemetryGeneratorService.generateBackClickedNewTelemetry(
      !isNavClicked,
      this.getEnvironment(),
      PageId.LOCATION
    );
    this.telemetryGeneratorService.generateBackClickedTelemetry(PageId.DISTRICT_MAPPING1, this.getEnvironment(),
      isNavClicked);
    this.location.back();
  }

  async ionViewWillEnter() {
    this.initializeLoader();
   
    this.profile = await this.profileService.getActiveSessionProfile({ requiredFields: ProfileConstants.REQUIRED_FIELDS }).toPromise();
    const isLoggedIn = this.appGlobalService.isUserLoggedIn();
    this.presetLocation = (await this.locationHandler.getAvailableLocation(
      this.profile.serverProfile ? this.profile.serverProfile : this.profile, isLoggedIn))
      .reduce<{ [code: string]: LocationSearchResult }>((acc, loc) => {
        if (loc) { acc[loc.type] = loc; }
        return acc;
      }, {});
    try {
        this.initialiseFormData({
          ...FormConstants.LOCATION_MAPPING,
          subType: this.presetLocation['state'] ? this.presetLocation['state'].code : FormConstants.LOCATION_MAPPING.subType
        });
      } catch (e) {
        this.initialiseFormData(FormConstants.LOCATION_MAPPING);
      }
    this.handleDeviceBackButton();
    this.checkLocationMandatory();
    this.telemetryGeneratorService.generateImpressionTelemetry(
      ImpressionType.PAGE_REQUEST, '',
      PageId.LOCATION,
      this.getEnvironment()
    );
    this.telemetryGeneratorService.generateImpressionTelemetry(
      ImpressionType.VIEW,
      '',
      PageId.DISTRICT_MAPPING1,
      this.getEnvironment(), '', '', '', undefined,
      featureIdMap.location.LOCATION_CAPTURE);
    this.headerService.hideHeader();
    // await this.checkLocationAvailability();
    const correlationList: Array<CorrelationData> = [];
    this.telemetryGeneratorService.generatePageLoadedTelemetry(
      PageId.LOCATION,
      this.getEnvironment(),
      undefined,
      undefined,
      undefined,
      undefined,
      correlationList
    );
    console.log("locationFormConfig 191",this.locationFormConfig)

  }

  async initializeLoader() {
    if (!this.loader) {
      this.loader = await this.commonUtilService.getLoader();
    }
  }

  handleDeviceBackButton() {
    if (this.isShowBackButton) {
      this.backButtonFunc = this.platform.backButton.subscribeWithPriority(10, () => {
        this.goBack(false);
      });
    }
  }

  ionViewWillLeave(): void {
    if (this.backButtonFunc) {
      this.backButtonFunc.unsubscribe();
    }
  }
  

  async submit1() {
    console.log("locationFormConfig 215",this.locationFormConfig)

    // this.saveDeviceLocation();
   // First API call
   this.role=true;
      const code = this.formGroup.value.udisecode;
      let locationArray = [];
      let initialPayload = {
        "request": {
          "filters": {
            "code": code,
            "type":"school"
          }
        }
      };

        const config = {
        url: urlConstants.API_URLS.SEARCH_LOCATION,
        payload: initialPayload
        };

        this.kendraService.post(config).subscribe(success => {
        if(success.result.count == 0){
          this.commonUtilService.showToast('INVALID UDISE CODE');
         this.button=false;
         this.locationdata={}
        }
        else{
        const school = success.result.response;
        this.locationdata.school = school[0];

        // Prepare the payload for the second API call
        let secondPayload = {
          "request": {
            "filters": {
              "id": school[0].parentId
            }
          }
        };

        const secondConfig = {
          url: urlConstants.API_URLS.SEARCH_LOCATION,
          payload: secondPayload
        };
        // Make the second API call
        this.kendraService.post(secondConfig).subscribe(secondSuccess => {
          const cluster = secondSuccess.result.response;
          this.locationdata.cluster = cluster[0];

        //   locationArray.push({
        //     "type": cluster[0].type,
        //     "code": cluster[0].code
        // });
          let thirdPayload = {
            "request": {
              "filters": {
                "id": cluster[0].parentId
              }
            }
          };
          const thirdConfig = {
            url: urlConstants.API_URLS.SEARCH_LOCATION,
            payload: thirdPayload
          };
          // Make the second API call
          this.kendraService.post(thirdConfig).subscribe(thirdSuccess => {
            const block = thirdSuccess.result.response;
          //   locationArray.push({
          //     "type": block[0].type,
          //     "code": block[0].code
          // });
          this.locationdata.block = block[0];

            let fourthPayload = {
              "request": {
                "filters": {
                  "id": block[0].parentId
                }
              }
            };
            const fourthConfig = {
              url: urlConstants.API_URLS.SEARCH_LOCATION,
              payload: fourthPayload
            };
            // Make the second API call
            this.kendraService.post(fourthConfig).subscribe(fourthSuccess => {
              const district = fourthSuccess.result.response;
            //   locationArray.push({
            //     "type": district[0].type,
            //     "code": district[0].code
            // });
            this.locationdata.district = district[0];

              let fifthPayload = {
                "request": {
                  "filters": {
                    "id": district[0].parentId
                  }
                }
              };
              const fifthConfig = {
                url: urlConstants.API_URLS.SEARCH_LOCATION,
                payload: fifthPayload
              };
              // Make the second API call
              this.kendraService.post(fifthConfig).subscribe(fifthSuccess => {
                const state = fifthSuccess.result.response;
                
                  this.button=true;
                
               
              //   locationArray.push({
              //     "type": state[0].type,
              //     "code": state[0].code
              // });
              this.locationdata.state = state[0];
              }, fifthError => {
              });
              
            }, fourthError => {
            });

          }, thirdError => {
          });


        }, secondError => {
        });
        }
        

      }, error => {
        });
        // console.log(" this.locationdata 314", this.locationdata)
        // this.initialiseFormData({
        //   ...FormConstants.LOCATION_MAPPING,
        //   subType: this.locationdata?.state?.code ? this.locationdata?.state?.code : FormConstants.LOCATION_MAPPING.subType
        // });
         
         console.log("locationFormConfig in submit 1",this.locationFormConfig)
  }
  
  selectSubEntity(subEntity) {

  console.log(subEntity)
  if(subEntity){
    this.udisetext=true;
    if(subEntity.detail.value == 'administrator'){
      this.admin=true 
      this.locationFormConfig = this.locationFormConfig
    }
    else {
      this.admin=false 
      this.locationFormConfig = this.locationFormConfig
    }
  }
  else{
    this.udisetext=false;
   
  }

 }
 selectSubEntity1(subrole){
  if(subrole){
    this.udisetext=true;
  }
  else{
    this.udisetext=false;
  }
 }
  async submit() {
    this.saveDeviceLocation();
    let locationCodes = [];
    //  this.formGroup.patchValue({
    //   children: {
    //     persona: this.locationdata
    //   }
    // });
  
    this.formGroup.value.children['persona'] = {
      "school": this.locationdata.school,
      "cluster": this.locationdata.cluster,
      "block": this.locationdata.block,
      "district": this.locationdata.district,
      "state": this.locationdata.state
  };

    (Object.keys(this.formGroup.value.children['persona']).map((acc, key) => {
      if (this.formGroup.value.children['persona'][acc]) {
        const location: SbLocation = this.formGroup.value.children['persona'][acc] as SbLocation;
        if (location.type) {
          locationCodes.push({
            type: location.type,
            code: location.code
          });
        }
      }
    }, {}));
    const corRelationList: CorrelationData[] =  locationCodes.map(r => ({ type: r.type, id: r.code || '' }));
    this.generateSubmitInteractEvent(corRelationList);
    this.telemetryGeneratorService.generateInteractTelemetry(
      this.isLocationUpdated ? InteractType.LOCATION_CHANGED : InteractType.LOCATION_UNCHANGED,
      this.isStateorDistrictChanged(locationCodes),
      this.getEnvironment(),
      PageId.DISTRICT_MAPPING1,
      undefined,
      undefined,
      undefined,
      featureIdMap.location.LOCATION_CAPTURE,
      ID.SUBMIT_CLICKED
    );
    // if (this.appGlobalService.isUserLoggedIn()) {
      if (!this.commonUtilService.networkInfo.isNetworkAvailable) {
        this.commonUtilService.showToast('INTERNET_CONNECTIVITY_NEEDED');
        return;
      }
      //  const name = this.userData.name;
       const name =this.userData.name.replace(RegexPatterns.SPECIALCHARECTERSANDEMOJIS, '').trim();

      const userTypes = [];
      // if (this.formGroup.value['persona'] && this.formGroup.value.children['persona'] && this.formGroup.value.children['persona']['subPersona'] && this.formGroup.value.children['persona']['subPersona'].length) {
      //   if (typeof this.formGroup.value.children['persona']['subPersona'] === 'string') {
      //     userTypes.push({
      //       type: this.formGroup.value['persona'],
      //       subType: this.formGroup.value.children['persona']['subPersona'] || undefined
      //     });
      //   }
      //   else if (Array.isArray(this.formGroup.value.children['persona']['subPersona'])) {
      //     for (let i = 0; i < this.formGroup.value.children['persona']['subPersona'].length; i++) {
      //       if(this.formGroup.value.children['persona']['subPersona'][i]){
      //         userTypes.push({
      //           "type": this.formGroup.value['persona'],
      //           "subType": this.formGroup.value.children['persona']['subPersona'][i]
      //         })
      //       }
      //     }
      //   }
      // }
      // else{
      //   userTypes.push({
      //     "type" : this.formGroup.value['persona']
      //   });
      // }
console.log("this.selectedRole",this.selectedRole)
  if(this.selectedRole == 'administrator'){
    this.selectedSubRole.forEach(subRole => {
      userTypes.push({
          type: this.selectedRole,
          subType: subRole
      });
  });
  }
  else if(this.selectedRole == 'youth'){
    userTypes.push({
      type: 'youth',
  });
  }
  else{
    userTypes.push({
      type: 'teacher',
  });
  }
      const req = {
        userId: this.appGlobalService.getCurrentUser().uid || this.profile.uid,
        profileLocation: locationCodes,
        ...((name ? { firstName: name } : {})),
        lastName: '',
        profileUserTypes: userTypes
      };
          const navigationExtras: NavigationExtras = {
            state: {
              userData: {...this.userData,
                location: this.formGroup.value.children['persona'],
                profileUserTypes: userTypes,
                userId: this.appGlobalService.getCurrentUser().uid || this.profile.uid}
            }
          };
          this.router.navigate([RouterLinks.SIGNUP_EMAIL], navigationExtras);
     




      // else {
      //   if (this.isGoogleSignIn) {
      //     req['firstName'] = this.userData.name;
      //     req['dob'] = this.userData.dob;
      //   }
      //   const loader = await this.commonUtilService.getLoader();
      //   await loader.present();
      //   const isSSOUser = await this.tncUpdateHandlerService.isSSOUser(this.profile);
      //   this.profileService.updateServerProfile(req).toPromise()
      //     .then(async () => {
      //       await loader.dismiss();
      //       this.preferences.putString(PreferenceKey.SELECTED_USER_TYPE, this.formGroup.value.persona).toPromise().then();
      //       if (!(await this.commonUtilService.isDeviceLocationAvailable())) { // adding the device loc if not available
      //         await this.saveDeviceLocation();
      //       }
      //       this.isLocationUpdated = false;
      //       this.generateLocationCaptured(false);
      //       this.commonUtilService.showToast('PROFILE_UPDATE_SUCCESS');
      //       this.events.publish('loggedInProfile:update', req);
      //       if (this.isGoogleSignIn) {
      //         const categoriesProfileData = {
      //           hasFilledLocation: true,
      //           showOnlyMandatoryFields: true,
      //         };
      //         this.router.navigate([`/${RouterLinks.PROFILE}/${RouterLinks.CATEGORIES_EDIT}`], {
      //           state: categoriesProfileData
      //         });
      //       } else if (this.profile && (this.source === PageId.GUEST_PROFILE || this.source === PageId.PROFILE_NAME_CONFIRMATION_POPUP)) {
      //           this.location.back();
      //       } else if (this.profile && this.source === PageId.PROFILE) {
      //           this.location.back();
      //           this.events.publish('UPDATE_TABS', {type: 'SWITCH_TABS_USERTYPE'});
      //       } else {
      //         if (this.profile && !isSSOUser) {
      //           this.appGlobalService.showYearOfBirthPopup(this.profile.serverProfile);
      //         }
      //         if (this.appGlobalService.isJoinTraningOnboardingFlow) {
      //           window.history.go(-this.navigateToCourse);
      //           this.externalIdVerificationService.showExternalIdVerificationPopup();
      //         } else {
      //           this.events.publish('UPDATE_TABS', {type: 'SWITCH_TABS_USERTYPE'});
      //           this.events.publish('update_header');
      //         }
      //       }
      //     }).catch(async () => {
      //       await loader.dismiss();
      //       this.commonUtilService.showToast('PROFILE_UPDATE_FAILED');
      //       if (this.profile) {
      //         this.location.back();
      //       } else {
      //         if (this.profile && !isSSOUser) {
      //           this.appGlobalService.showYearOfBirthPopup(this.profile.serverProfile);
      //         }
      //         this.router.navigate([`/${RouterLinks.TABS}`]);
      //         this.events.publish('update_header');
      //       }
      //     });
      // }
    // } 
    // else if (this.source === PageId.GUEST_PROFILE) { // block for editing the device location
    //   this.generateLocationCaptured(true); // is dirtrict or location edit  = true
    //   await this.saveDeviceLocation();
    //   this.events.publish('refresh:profile');
    //   this.location.back();
    // }
    //  else { // add or update the device loc
      // await this.saveDeviceLocation();
      // this.appGlobalService.setOnBoardingCompleted();
      // const navigationExtras: NavigationExtras = {
      //   state: {
      //     loginMode: 'guest'
      //   }
      // };
      // this.telemetryGeneratorService.generateAuditTelemetry(
      //   this.getEnvironment(),
      //   AuditState.AUDIT_UPDATED,
      //   undefined,
      //   AuditType.SET_PROFILE,
      //   undefined,
      //   undefined,
      //   undefined,
      //   corRelationList
      // );
      // // this.router.navigate([`/${RouterLinks.SIGNUP_EMAIL}`]);
      // this.router.navigate([`/${RouterLinks.TABS}`], navigationExtras);

      // this.events.publish('update_header');
     
    // }
  }

  private async saveDeviceLocation() {
    const loader = await this.commonUtilService.getLoader();
    await loader.present();
    const req: DeviceRegisterRequest = {
      userDeclaredLocation: {
        ...(Object.keys(this.formGroup.value.children['persona']).reduce((acc, key) => {
          if (this.formGroup.value.children['persona'][key]) {
            acc[key] = (this.formGroup.value.children['persona'][key] as SbLocation).name;
            acc[key + 'Id'] = (this.formGroup.value.children['persona'][key] as SbLocation).id;
          }
          return acc;
        }, {})),
        declaredOffline: !this.commonUtilService.networkInfo.isNetworkAvailable
      }
    } as any;
  const data =  this.deviceRegisterService.registerDevice(req).toPromise();
    if (this.appGlobalService.isGuestUser) {
      this.preferences.putString(PreferenceKey.GUEST_USER_LOCATION, JSON.stringify(req.userDeclaredLocation)).toPromise();
    }
    this.preferences.putString(PreferenceKey.DEVICE_LOCATION, JSON.stringify(req.userDeclaredLocation)).toPromise();
    // this.commonUtilService.handleToTopicBasedNotification();
    await loader.dismiss();
  }

  private async checkLocationMandatory() {
    let skipValues = [];
    await this.formAndFrameworkUtilService.getLocationConfig()
      .then((locationConfig) => {
        for (const field of locationConfig) {
          if (field.code === LocationConfig.CODE_SKIP) {
            skipValues = field.values;
            break;
          }
        }
      });
    for (const value of skipValues) {
      if (this.appGlobalService.isUserLoggedIn()) {
        if (!this.profile && value === LocationConfig.SKIP_USER) {
          this.showNotNowFlag = true;
        }
      } else if (!(this.source === PageId.GUEST_PROFILE) && value === LocationConfig.SKIP_DEVICE) {
        this.showNotNowFlag = true;
      }
    }
  }

  private skipLocation() {
    this.router.navigate([`/${RouterLinks.TABS}`]);
    this.events.publish('update_header');
  }

  private getEnvironment(): string {
    return (this.source === PageId.GUEST_PROFILE || this.source === PageId.PROFILE) ? Environment.USER : Environment.ONBOARDING;
  }

  cancelEvent(category?: string) {
    const correlationList: Array<CorrelationData> = [];
    /* New Telemetry */
    correlationList.push({ id: PageId.POPUP_CATEGORY, type: CorReleationDataType.CHILD_UI });
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.SELECT_CANCEL, '',
      this.getEnvironment(),
      PageId.LOCATION,
      undefined,
      undefined,
      undefined,
      correlationList
    );
  }

  private async initialiseFormData(
    formRequest: FormRequest
  ) {
    let locationMappingConfig: FieldConfig<any>[];
    try {
      locationMappingConfig = await this.formAndFrameworkUtilService.getFormFields(formRequest);
    } catch (e) {
      locationMappingConfig = await this.formAndFrameworkUtilService.getFormFields(FormConstants.LOCATION_MAPPING);
    }
    console.log("647",locationMappingConfig)
    let selectedUserType = await this.preferences.getString(PreferenceKey.SELECTED_USER_TYPE).toPromise();
    const useCaseList =
      this.appGlobalService.isUserLoggedIn() ? ['SIGNEDIN_GUEST', 'SIGNEDIN'] : ['SIGNEDIN_GUEST', 'GUEST'];
    for (const config of locationMappingConfig) {
      if (config.code === 'name' && (this.source === PageId.PROFILE || this.source === PageId.PROFILE_NAME_CONFIRMATION_POPUP)
      && !this.isGoogleSignIn) {
        config.templateOptions.hidden = false;
        config.default = (this.profile && this.profile.serverProfile && this.profile.serverProfile.firstName) ?
        this.profile.serverProfile.firstName : this.profile.handle;
      } else if (config.code === 'name' && this.source !== PageId.PROFILE) {
        config.validations = [];
      }
      if (config.code === 'persona') {
        if (this.isGoogleSignIn && selectedUserType === ProfileType.NONE) {
          const guestUser = await this.commonUtilService.getGuestUserConfig();
          selectedUserType = (this.profile.serverProfile && !this.profile.serverProfile.profileUserType.type) ?
            guestUser.profileType : selectedUserType;
        }
        config.default = (this.profile && this.profile.serverProfile
        && this.profile.serverProfile.profileUserType.type
        && (this.profile.serverProfile.profileUserType.type !== ProfileType.OTHER.toUpperCase())) ?
        this.profile.serverProfile.profileUserType.type : selectedUserType;
        if (this.source === PageId.PROFILE) {
          config.templateOptions.hidden = false;
        }
      }

      config.default = this.prevFormValue[config.code] || config.default;

      if (config.templateOptions['dataSrc'] && config.templateOptions['dataSrc']['marker'] === 'SUPPORTED_PERSONA_LIST') {
       console.log("this.profileHandler.getSupportedUserTypes()",this.profileHandler.getSupportedUserTypes())
        config.templateOptions.options = (await this.profileHandler.getSupportedUserTypes())
          .filter(userType => {
            return userType.isActive;
          })
          .map(p => ({
            label: p.name,
            value: p.code
          }));
        Object.keys(config.children).forEach((persona) => {
          config.children[persona].map((personaConfig) => {
            if (!useCaseList.includes(personaConfig.templateOptions['dataSrc']['params']['useCase']) && !this.isGoogleSignIn) {
              personaConfig.templateOptions['hidden'] = true;
              personaConfig.validations = [];
            }
            if (!personaConfig.templateOptions['dataSrc']) {
              return personaConfig;
            }
            personaConfig.default = this.setDefaultConfig(personaConfig);
            switch (personaConfig.templateOptions['dataSrc']['marker']) {
              case 'SUBPERSONA_LIST': {
                if (this.profile.serverProfile) {
                  if(personaConfig.templateOptions.multiple){
                    const subPersonaCodes = [];
                    if(!this.profile.serverProfile.profileUserTypes && !this.profile.serverProfile.profileUserTypes.length && this.profile.serverProfile.profileUserType) {
                      if(typeof this.profile.serverProfile.profileUserType === 'string'){
                        subPersonaCodes.push(this.profile.serverProfile.profileUserType);
                      } else if(this.profile.serverProfile.profileUserType.subType){
                        subPersonaCodes.push(this.profile.serverProfile.profileUserType.subType);
                      }
                    }
                    else if(this.profile.serverProfile.profileUserTypes && this.profile.serverProfile.profileUserTypes.length){
                      for( let i =0; i< this.profile.serverProfile.profileUserTypes.length; i++){
                        if(this.profile.serverProfile.profileUserTypes[i].subType){
                          subPersonaCodes.push(this.profile.serverProfile.profileUserTypes[i].subType);
                        }
                      }
                    }
                    personaConfig.default = subPersonaCodes;
                  }
                  else if(this.profile.serverProfile.profileUserType && this.profile.serverProfile.profileUserType.subType){
                    personaConfig.default = this.profile.serverProfile.profileUserType.subType;
                  }
                }
                break;
              }
              case 'STATE_LOCATION_LIST': {
                personaConfig.templateOptions.options = this.formLocationFactory.buildStateListClosure(personaConfig, this.initialFormLoad);
                break;
              }
              case 'LOCATION_LIST': {
                personaConfig.templateOptions.options = this.formLocationFactory.buildLocationListClosure(personaConfig,
                  this.initialFormLoad);
                break;
              }
            }

            personaConfig.default = (this.prevFormValue && this.prevFormValue.children && this.prevFormValue.children.persona) ?
              this.prevFormValue.children.persona[personaConfig.code] :
              personaConfig.default;

            return personaConfig;
          });
        });
      }
    }
    this.initialFormLoad = false;
    this.locationFormConfig = locationMappingConfig;
    console.log("locationFormConfig 744",this.locationFormConfig)

  //    if(this.params){
  //   this.fieldConfig();
  // }
  }


  private setDefaultConfig(fieldConfig: FieldConfig<any>): SbLocation {
    if (this.presetLocation[fieldConfig.code]) {
      return this.presetLocation[fieldConfig.code];
    }
    return null;
  }

  async onFormInitialize(formGroup: FormGroup) {
    this.formGroup = formGroup;
    if (this.formValueSubscription) {
      this.formValueSubscription.unsubscribe();
    }
    this.formValueSubscription = this.formGroup.valueChanges.pipe(
      filter((v) => v['children'] && !!Object.keys(v['children']).length),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      pairwise(),
      delay(100),
      filter(() => this.formGroup.dirty),
      tap(([prev, curr]) => {
        const changeField = this.isChangedLocation(prev, curr);
        if (changeField) {
          this.isLocationUpdated = true;
          this.generateTelemetryForCategoryClicked(changeField);
        }
      })
    ).subscribe();
  }

  async onFormValueChange(value: any) {
  }

  async onDataLoadStatusChange($event) {
    if ('LOADING' === $event) {
      await this.loader.present();
    } else {
      await this.loader.dismiss();
      const subPersonaFormControl = this.formGroup.get('children.persona.subPersona');
      if (subPersonaFormControl && !subPersonaFormControl.value) {
        subPersonaFormControl.patchValue(this.profile.serverProfile.profileUserType.subType || null);
      }
      if (!this.stateChangeSubscription) {
        this.stateChangeSubscription = concat(
          of(this.formGroup.get('persona').value),
          this.formGroup.get('persona').valueChanges
        ).pipe(
          distinctUntilChanged(),
          delay(100),
          mergeMap(() => defer(() => {
            return this.formGroup.get('children.persona.state').valueChanges.pipe(
              distinctUntilChanged(),
              take(1)
            );
          }))
        ).subscribe(async (newStateValue) => {
          if (!newStateValue) { return; }
          this.locationFormConfig = undefined;
          this.stateChangeSubscription = undefined;
          this.loader.present();
          this.formGroup.value.children.persona.subPersona = [];
          this.prevFormValue = { ...this.formGroup.value };
          this.initialiseFormData({
            ...FormConstants.LOCATION_MAPPING,
            subType: (newStateValue as SbLocation).code,
          }).catch((e) => {
            console.error(e);
            this.initialiseFormData(FormConstants.LOCATION_MAPPING);
          });
        });
      }
    }
  }

  generateTelemetryForCategorySelect(value, isState) {
    const corRelationList: CorrelationData[] = [{ id: PageId.POPUP_CATEGORY, type: CorReleationDataType.CHILD_UI }];
    corRelationList.push({
      id: value || '',
      type: isState ? CorReleationDataType.STATE : CorReleationDataType.DISTRICT
    });
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.SELECT_SUBMIT, '',
      this.getEnvironment(),
      PageId.LOCATION,
      undefined,
      undefined,
      undefined,
      corRelationList
    );
  }

  clearUserLocationSelections() {
    const stateFormControl = this.formGroup.get('children.persona.state');
    /* istanbul ignore else */
    if (stateFormControl) {
      stateFormControl.patchValue(null);
    }
    const correlationList: Array<CorrelationData> = [];
    correlationList.push({ id: PageId.POPUP_CATEGORY, type: CorReleationDataType.CHILD_UI });
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.SELECT_CANCEL, '',
      this.getEnvironment(),
      PageId.LOCATION,
      undefined,
      undefined,
      undefined,
      correlationList
    );
  }

  generateSubmitInteractEvent(corReletionList) {
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.SELECT_SUBMIT, '',
      this.getEnvironment(),
      PageId.LOCATION,
      undefined,
      undefined,
      undefined,
      corReletionList
    );
  }

  ngOnDestroy() {
    if (this.formValueSubscription) {
      this.formValueSubscription.unsubscribe();
    }
  }

  isChangedLocation(prev, curr) {
    if(prev.persona!= curr.persona){
      this.telemetryGeneratorService.generateInteractTelemetry(
        InteractType.ROLE_CHANGED, '',
        this.getEnvironment(),
        PageId.LOCATION,
        undefined,
        undefined,
        undefined,
        undefined,
        curr.persona
      );
    }
    let newLocation;
    Object.keys(curr['children']['persona']).forEach((key) => {
      if (curr['children']['persona'][key] && (!prev['children']['persona'][key] ||
       (curr['children']['persona'][key].code !== prev['children']['persona'][key].code))) {
        newLocation = curr['children']['persona'][key];
      }
    });
    return newLocation;
  }

  generateTelemetryForCategoryClicked(location) {
    const correlationList: Array<CorrelationData> = [];
    correlationList.push({
    id: location.name,
    type: location.type.charAt(0).toUpperCase() + location.type.slice(1)
    });
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.SELECT_CATEGORY, '',
      this.getEnvironment(),
      PageId.LOCATION,
      undefined,
      undefined,
      undefined,
      correlationList
    );
  }

  isStateorDistrictChanged(locationCodes) {
    let changeStatus;
    locationCodes.forEach((d) => {
      if (!changeStatus && d.type === 'state' && this.presetLocation['state']
      && (d.code !== this.presetLocation['state'].code)) {
        changeStatus = InteractSubtype.STATE_DIST_CHANGED;
      } else if (!changeStatus && d.type === 'district' && this.presetLocation['district']
      && (d.code !== this.presetLocation['district'].code)) {
        changeStatus = InteractSubtype.DIST_CHANGED;
      }
    });
    return changeStatus;
  }

  generateLocationCaptured(isEdited: boolean) {
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.TOUCH,
      InteractSubtype.LOCATION_CAPTURED,
      this.getEnvironment(),
      PageId.DISTRICT_MAPPING1,
      undefined,
      {
        isEdited
      }, undefined,
      featureIdMap.location.LOCATION_CAPTURE);
  }

  redirectToLogin() {
    this.router.navigate([RouterLinks.SIGN_IN]);
  }
  // fieldConfig(){
  //   this.locationFormConfig.forEach(element => {
  //     if(element.code  != this.params.code){
  //       element.templateOptions.hidden = true;
  //       element.templateOptions.disabled = true;
  //       if( this.params.children){
  //         let keys = Object.keys(element.children);
  //         keys.forEach(key => {
  //           element.children[key].forEach(childEl => {
  //             childEl.templateOptions.hidden =true;
  //             childEl.templateOptions.disabled =true;
  //            });
  //         });
  //       }
  //     }
  //   });
  // }
}