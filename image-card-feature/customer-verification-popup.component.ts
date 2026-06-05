import { CommonModule } from "@angular/common";
import { HttpParams } from "@angular/common/http";
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { NgbModalOptions, NgbModalRef } from "@ng-bootstrap/ng-bootstrap";
import { AuthenticatedBaseComponent } from "../../../../base/authenticated_base.component";
import { KYCStatusConstants } from "../../../../helpers/constants/status_constants";
import { EncryptionHelper } from "../../../../helpers/encryption_helper";
import { LookupModel } from "../../../../models/lookup_model";
import { Utils } from "../../../../utils";
import { ImageCardComponent } from "../../cards/image-card/image-card.component";
import { SelectSingleLookupComponent } from "../../select-single-lookup/select-single-lookup.component";

@Component({
  selector: "app-customer-verification-popup",
  templateUrl: "./customer-verification-popup.component.html",
  styleUrls: ["./customer-verification-popup.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SelectSingleLookupComponent,
    // SelectMultiLookupComponent,
    ImageCardComponent,
  ],
})
export class CustomerVerificationPopupComponent extends AuthenticatedBaseComponent {
  @Input() id = "";
  @Input() model?: any = {};
  @Input() reasons?: any;
  @Input() statuses?: any;

  public RegistrationStatus?: string;
  public RejectionReason?: string;

  private payload: {
    customerId: string;
    registrationStatusId: string;
    verificationRejectReasonId?: string | null;
  } = {
    customerId: "",
    registrationStatusId: "",
    verificationRejectReasonId: null,
  };

  public activeTab = "customer-verification";

  public FROZEN_ID = KYCStatusConstants.FROZEN;
  public REJECTED_ID = KYCStatusConstants.REJECTED;
  public APPROVED_ID = KYCStatusConstants.APPROVED;
  public REQUESTED_ID = KYCStatusConstants.KYC_REQUESTED;
  public RESUBMITTED_ID = KYCStatusConstants.RESUBMITTED;
  public PENDING_RE_APPROVAL_ID = KYCStatusConstants.PENDING_KYC_RE_APPROVAL;

  @ViewChild("personalDetailsTemplate")
  PersonalDetailsTemplate!: TemplateRef<any>;

  public modalDialog!: NgbModalRef;

  @Output() OnSave: EventEmitter<BigInteger> = new EventEmitter<BigInteger>();
  @Output() OnCancel: EventEmitter<any> = new EventEmitter<any>();

  @HostListener("document:keydown.escape", ["$event"]) onKeydownHandler(
    event: KeyboardEvent,
  ) {
    console.log(event);

    if (this.modalDialog != null) {
      this.modalDialog.close();
    }
  }

  public async showDialog() {
    const option: NgbModalOptions = {
      windowClass: "modal-standard-height",
      size: "xl",
      centered: true,
      animation: true,
    };

    await this.refresh(this.id);

    this.modalDialog = this.ngbModalService.open(
      this.PersonalDetailsTemplate,
      option,
    );

    this.statuses = Utils.lookup_converter(
      this.statuses,
      "RegistrationStatusId",
      "Status",
    );
    this.reasons = Utils.lookup_converter(
      this.reasons,
      "RejectReasonId",
      "Reason",
    );

    this.payload.customerId = this.id;
  }

  public async refresh(id: string): Promise<void> {
    id = await EncryptionHelper.decrypt(id);

    const response = await this.get_async_call(
      "Customer/GetUnverifiedCustomerId",
      new HttpParams().set("id", id),
    );

    if (!response.isError) {
      this.ViewModel = response.data;
    }
  }

  public async update() {
    const response = await this.post_sync_call(
      "Customer/VerifyAccount",
      this.payload,
    );

    if (!response.isError) {
      this.RegistrationStatus = undefined;
      this.RejectionReason = undefined;
      this.cancelClick();
      this.OnSave.emit();
    }
  }

  public cancelClick() {
    this.modalDialog.close();
  }

  public switchTab(tab: string) {
    this.activeTab = tab;
  }

  public async onChangeLookup(lookup: LookupModel, listFieldName: string) {
    if (listFieldName === "KYCStatusId")
      this.payload.registrationStatusId = lookup.id;
    if (listFieldName === "RejectReasonId")
      this.payload.verificationRejectReasonId = lookup.id;
  }
}
