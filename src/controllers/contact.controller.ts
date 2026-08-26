import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { ContactRepository } from '../repositories/contact.repository';
import { logAudit } from '../utils/audit';

export const ContactController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                search: req.query.search as string | undefined,
                category: req.query.category as string | undefined,
            };

            const [data, total] = await Promise.all([
                ContactRepository.findAll(orgId, skip, limit, filters),
                ContactRepository.count(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch contacts', error);
        }
    },

    archived: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                search: req.query.search as string | undefined,
                category: req.query.category as string | undefined,
            };

            const [data, total] = await Promise.all([
                ContactRepository.findArchived(orgId, skip, limit, filters),
                ContactRepository.countArchived(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch archived contacts', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const contact = await ContactRepository.findById(req.params.id, orgId);
            if (!contact) return sendError(res, 404, 'Contact not found');
            res.json(contact);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch contact', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const contact = await ContactRepository.create({
                ...req.body,
                organizationId: orgId,
                createdBy: userId,
            });

            res.status(201).json(contact);
            await logAudit(req, { action: 'CREATE', entityType: 'Contact', entityId: contact.id, entityName: contact.name ?? contact.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to create contact', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ContactRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Contact not found');

            const contact = await ContactRepository.update(req.params.id, req.body, orgId);
            if (!contact) return sendError(res, 404, 'Contact not found');
            res.json(contact);
            await logAudit(req, { action: 'UPDATE', entityType: 'Contact', entityId: contact.id, entityName: contact.name ?? contact.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to update contact', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ContactRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Contact not found');

            await ContactRepository.softDelete(req.params.id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Contact', entityId: existing.id, entityName: existing.name ?? existing.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete contact', error);
        }
    },

    archive: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ContactRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Contact not found');

            await ContactRepository.softDelete(req.params.id, orgId);
            res.json({ message: 'Contact archived' });
            await logAudit(req, { action: 'ARCHIVE', entityType: 'Contact', entityId: existing.id, entityName: existing.name ?? existing.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to archive contact', error);
        }
    },

    restore: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const contact = await ContactRepository.restore(req.params.id, orgId);
            if (!contact) return sendError(res, 404, 'Contact not found');
            res.json(contact);
            await logAudit(req, { action: 'RESTORE', entityType: 'Contact', entityId: contact.id, entityName: contact.name ?? contact.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to restore contact', error);
        }
    },

    bulkDelete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { ids } = req.body;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return sendError(res, 400, 'ids array is required');
            }

            await ContactRepository.bulkSoftDelete(ids, orgId);
            res.json({ message: `${ids.length} contacts deleted` });
            await logAudit(req, { action: 'BULK_DELETE', entityType: 'Contact', details: `Deleted ${ids.length} contacts` });
        } catch (error) {
            return sendError(res, 500, 'Failed to bulk delete contacts', error);
        }
    },

    // Notes
    addNote: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const userId = (req as any).userId;
            const { contactId } = req.params;

            const contact = await ContactRepository.findById(contactId, orgId);
            if (!contact) return sendError(res, 404, 'Contact not found');

            const note = await ContactRepository.addNote({
                contactId,
                note: req.body.note,
                createdBy: userId,
            });

            res.status(201).json(note);
        } catch (error) {
            return sendError(res, 500, 'Failed to add note', error);
        }
    },

    deleteNote: async (req: Request, res: Response) => {
        try {
            const result = await ContactRepository.deleteNote(req.params.noteId, (req as any).orgId);
            if (result.count === 0) return sendError(res, 404, 'Note not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete note', error);
        }
    },

    // File links
    addFileLink: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const userId = (req as any).userId;
            const { contactId } = req.params;

            const contact = await ContactRepository.findById(contactId, orgId);
            if (!contact) return sendError(res, 404, 'Contact not found');

            const fileLink = await ContactRepository.addFileLink({
                contactId,
                title: req.body.title,
                url: req.body.url,
                fileType: req.body.fileType,
                createdBy: userId,
            });

            res.status(201).json(fileLink);
        } catch (error) {
            return sendError(res, 500, 'Failed to add file link', error);
        }
    },

    deleteFileLink: async (req: Request, res: Response) => {
        try {
            const result = await ContactRepository.deleteFileLink(req.params.fileId, (req as any).orgId);
            if (result.count === 0) return sendError(res, 404, 'File link not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete file link', error);
        }
    },
};
