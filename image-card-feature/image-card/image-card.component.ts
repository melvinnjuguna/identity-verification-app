import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { ExtensionMethods } from "../../../../helpers/extension_methods";

@Component({
  selector: "app-image-card",
  templateUrl: "./image-card.component.html",
  styleUrls: ["./image-card.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class ImageCardComponent implements OnChanges {
  @Input() imageUrl?: string = "";
  @Input() label?: string = "";
  @Input() orientation: "landscape" | "portrait" | "square" = "landscape";

  public IMAGE?: string;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["imageUrl"]) {
      this.IMAGE = this.imageUrl
        ? ExtensionMethods.to_base_64_image(this.imageUrl)
        : undefined;
    }
  }
}