import { validateDocument, type SupportedDocument } from "@wenshu/document-model";
import {
  validateProjectContract,
  type ProjectContract,
} from "@wenshu/project-contract";
import { validateTemplate, type WenshuTemplate } from "@wenshu/template-model";

import { KnowledgePackageError } from "./errors.ts";

export function mustValidateProjectContract(
  input: unknown,
  context: string,
): ProjectContract {
  const result = validateProjectContract(input);
  if (!result.ok) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `${context} failed validation: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}

export function mustValidateDocument(input: unknown): SupportedDocument {
  const result = validateDocument(input);
  if (!result.ok) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `document failed validation: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}

export function mustValidateTemplate(input: unknown): WenshuTemplate {
  const result = validateTemplate(input);
  if (!result.ok) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `template failed validation: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}
