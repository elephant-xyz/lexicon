import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import lexiconJson from '../../src/data/lexicon.json';
import {
  generateJSONSchemaForClass,
  generateJSONSchemaForDataGroup,
  generateJSONSchemaForRelationship,
} from '../../vite-plugins/json-schema-generator';
import type { LexiconData } from '../../src/types/lexicon';

const lexicon = lexiconJson as unknown as LexiconData;

const COMMUNICATION_CLASSES = [
  'source_system',
  'source_record',
  'communication_session',
  'transcript',
  'utterance',
  'source_speaker',
  'participation',
] as const;

const REUSED_IDENTITY_CLASSES = ['person', 'company'] as const;

function getClass(type: string) {
  const lexiconClass = lexicon.classes.find(candidate => candidate.type === type);
  expect(lexiconClass, `Expected ${type} class to exist`).toBeDefined();
  return lexiconClass!;
}

function getCommunicationGroup() {
  const group = lexicon.data_groups.find(entry => entry.label === 'Communication');
  expect(group, 'Expected Communication data group').toBeDefined();
  return group!;
}

function buildValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv;
}

describe('shared communication vocabulary', () => {
  it('defines every communication class exactly once and not deprecated', () => {
    for (const type of COMMUNICATION_CLASSES) {
      const matches = lexicon.classes.filter(candidate => candidate.type === type);
      expect(matches, `Expected exactly one ${type} class`).toHaveLength(1);
      expect(matches[0].is_deprecated).toBe(false);
      expect(matches[0].description, `${type} must be described`).toBeTruthy();
      expect(matches[0].example, `${type} must carry an example`).toBeDefined();
    }
  });

  it('reuses person and company instead of duplicating identity concepts', () => {
    for (const type of REUSED_IDENTITY_CLASSES) {
      expect(lexicon.classes.filter(candidate => candidate.type === type)).toHaveLength(1);
    }
    const duplicates = lexicon.classes.filter(candidate =>
      ['organization', 'organisation', 'communication_person', 'communication_company'].includes(
        candidate.type
      )
    );
    expect(duplicates).toHaveLength(0);
  });

  it('keeps the pre-existing contact-channel communication class unchanged', () => {
    const communication = getClass('communication');
    expect(communication.container_name).toBe('communication');
    expect(Object.keys(communication.properties)).toEqual(['email_address', 'phone_number']);
    expect(Object.keys(communication.relationships ?? {})).toEqual([
      'has_communication_validation',
      'has_mailing_address',
    ]);
  });

  it('uses only the approved session kinds', () => {
    const session = getClass('communication_session');
    expect(session.properties.session_kind.enum).toEqual(['MEETING', 'CHAT']);
    expect(session.properties.session_kind.type).toBe('string');
    expect(generateJSONSchemaForClass(session).required).toEqual([
      'session_identifier',
      'session_kind',
    ]);
  });

  it('preserves source identity, revision, finalization and checksum on source records', () => {
    const record = getClass('source_record');
    expect(generateJSONSchemaForClass(record).required).toEqual([
      'source_record_identifier',
      'record_kind',
      'finalization_status',
      'content_checksum',
      'retrieved_at',
    ]);
    expect(record.properties.finalization_status.enum).toEqual([
      'PENDING',
      'FINAL',
      'EDITED',
      'DELETED',
    ]);
    expect(record.properties.content_checksum.pattern).toBe('^sha256:[a-f0-9]{64}$');
    expect(record.properties.source_revision.optional).toBe(true);
    expect(record.properties.page_cursor.optional).toBe(true);
  });

  it('orders utterances and links them to media timing', () => {
    const utterance = getClass('utterance');
    expect(generateJSONSchemaForClass(utterance).required).toEqual([
      'utterance_identifier',
      'sequence_number',
      'text',
    ]);
    expect(utterance.properties.sequence_number.type).toBe('integer');
    expect(utterance.properties.sequence_number.minimum).toBe(0);
    expect(utterance.properties.start_offset_ms.type).toEqual(['integer', 'null']);
    expect(utterance.properties.recognition_confidence.maximum).toBe(1);
  });

  it('keeps speaker attribution evidence-backed with explicit confidence', () => {
    const speaker = getClass('source_speaker');
    expect(speaker.properties.person_resolution_method.enum).toEqual([
      'EXPLICIT',
      'INFERRED',
      'UNRESOLVED',
    ]);
    expect(speaker.properties.person_resolution_confidence.type).toEqual(['number', 'null']);
    expect(generateJSONSchemaForClass(speaker).required).toEqual([
      'source_speaker_identifier',
      'person_resolution_method',
    ]);
  });

  it('validates every class example against its generated JSON Schema', () => {
    const ajv = buildValidator();
    for (const type of COMMUNICATION_CLASSES) {
      const lexiconClass = getClass(type);
      const schema = generateJSONSchemaForClass(lexiconClass);
      const validate = ajv.compile(schema);
      const valid = validate(lexiconClass.example);
      expect(valid, `${type} example: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('rejects an invalid session kind and a malformed checksum', () => {
    const ajv = buildValidator();
    const session = getClass('communication_session');
    const validateSession = ajv.compile(generateJSONSchemaForClass(session));
    expect(validateSession({ ...session.example, session_kind: 'EMAIL' })).toBe(false);

    const record = getClass('source_record');
    const validateRecord = ajv.compile(generateJSONSchemaForClass(record));
    expect(validateRecord({ ...record.example, content_checksum: 'md5:abc' })).toBe(false);
    expect(validateRecord({ ...record.example, finalization_status: 'ARCHIVED' })).toBe(false);
  });

  it('declares the Communication data group over existing classes only', () => {
    const group = getCommunicationGroup();
    const classTypes = new Set(lexicon.classes.map(candidate => candidate.type));
    for (const relationship of group.relationships) {
      expect(relationship.type).toBe('relationship');
      expect(classTypes.has(relationship.from), `${relationship.from} must exist`).toBe(true);
      expect(classTypes.has(relationship.to), `${relationship.to} must exist`).toBe(true);
      expect(getClass(relationship.from).is_deprecated).toBe(false);
      expect(getClass(relationship.to).is_deprecated).toBe(false);
      expect(relationship.relationship_type).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    const relationshipTypes = group.relationships.map(entry => entry.relationship_type);
    expect(new Set(relationshipTypes).size).toBe(relationshipTypes.length);
    for (const required of group.required ?? []) {
      expect(relationshipTypes).toContain(required);
    }
    for (const oneToMany of group.one_to_many_relationships ?? []) {
      expect(relationshipTypes).toContain(oneToMany);
    }
  });

  it('does not collide with relationship types owned by other data groups', () => {
    const group = getCommunicationGroup();
    const own = new Set(group.relationships.map(entry => entry.relationship_type));
    for (const other of lexicon.data_groups) {
      if (other.label === 'Communication') continue;
      for (const relationship of other.relationships) {
        expect(own.has(relationship.relationship_type)).toBe(false);
      }
    }
  });

  it('links sessions, transcripts, utterances, speakers and participants to shared identity', () => {
    const group = getCommunicationGroup();
    const expectedEdges = [
      ['source_system', 'source_record', 'source_system_has_source_record'],
      ['communication_session', 'source_system', 'communication_session_has_source_system'],
      ['communication_session', 'source_record', 'communication_session_has_source_record'],
      ['communication_session', 'transcript', 'communication_session_has_transcript'],
      ['communication_session', 'participation', 'communication_session_has_participation'],
      ['transcript', 'utterance', 'transcript_has_utterance'],
      ['transcript', 'source_speaker', 'transcript_has_source_speaker'],
      ['utterance', 'source_speaker', 'utterance_has_source_speaker'],
      ['utterance', 'source_record', 'utterance_has_source_record'],
      ['source_speaker', 'person', 'source_speaker_has_person'],
      ['participation', 'person', 'participation_has_person'],
      ['participation', 'company', 'participation_has_company'],
    ];
    for (const [from, to, relationshipType] of expectedEdges) {
      expect(group.relationships).toContainEqual({
        type: 'relationship',
        from,
        to,
        relationship_type: relationshipType,
      });
    }
    expect(group.required).toEqual([
      'communication_session_has_source_system',
      'communication_session_has_source_record',
    ]);
    expect(group.one_to_many_relationships).toContain('transcript_has_utterance');
  });

  it('defines supersession for transcripts and source records', () => {
    const group = getCommunicationGroup();
    expect(group.relationships).toContainEqual({
      type: 'relationship',
      from: 'transcript',
      to: 'transcript',
      relationship_type: 'transcript_supersedes_transcript',
    });
    expect(group.relationships).toContainEqual({
      type: 'relationship',
      from: 'source_record',
      to: 'source_record',
      relationship_type: 'source_record_supersedes_source_record',
    });
    expect(group.one_to_many_relationships).not.toContain('transcript_supersedes_transcript');
  });

  it('generates relationship and data-group schemas for the Communication group', () => {
    const group = getCommunicationGroup();
    const classCids = Object.fromEntries(lexicon.classes.map(candidate => [candidate.type, '']));
    const relationshipCids: Record<string, { cid: string; relationshipType: string }> = {};
    for (const relationship of group.relationships) {
      const schema = generateJSONSchemaForRelationship(relationship, classCids);
      expect(schema.required).toEqual(['from', 'to']);
      relationshipCids[`${relationship.from}_to_${relationship.to}`] = {
        cid: '',
        relationshipType: relationship.relationship_type,
      };
    }
    const groupSchema = generateJSONSchemaForDataGroup(
      group,
      relationshipCids,
      lexicon.data_groups.map(entry => entry.label)
    );
    expect(groupSchema.title).toBe('Communication');
    const relationships = (
      groupSchema as unknown as {
        properties: {
          relationships: { required: string[]; properties: Record<string, { type: unknown }> };
        };
      }
    ).properties.relationships;
    expect(relationships.required).toEqual([
      'communication_session_has_source_system',
      'communication_session_has_source_record',
    ]);
    expect(relationships.properties.transcript_has_utterance.type).toEqual(['array', 'null']);
    expect(relationships.properties.communication_session_has_source_record.type).toBe('array');
    expect(relationships.properties.transcript_supersedes_transcript.type).toEqual([
      'string',
      'null',
    ]);
  });
});
