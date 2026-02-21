import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatName', pure: true })
export class FormatNamePipe implements PipeTransform {
  transform(value: string): string {
    return value.replace(/_/g, ' ');
  }
}
