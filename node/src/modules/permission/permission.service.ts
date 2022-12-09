import { Injectable } from '@nestjs/common';
import { ApolloError } from 'apollo-server-express';
import { Constants } from 'src/constants';
import { ErrorCode } from 'src/models/error.code';
import { Permission, PermissionDocument, Rule } from 'src/models/permission';
import { RoleTemplate, RoleTemplateDocument } from 'src/models/role.template';
import { PermissionInput } from 'src/graphql.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class PermissionService {
  constructor(
    @InjectModel(Permission.name)
    private readonly permissionModel: Model<PermissionDocument>,
    @InjectModel(RoleTemplate.name)
    private readonly roleTemplateModel: Model<RoleTemplateDocument>,
  ) {}

  async create(inputs: PermissionInput[]): Promise<Permission> {
    // create the permission on the database
    const permission = new Permission();
    permission.rules = inputs.flatMap((input) => {
      const rule = new Rule();
      rule.action = input.action;
      rule.subject = input.subject;
      return rule;
    });

    return this.permissionModel.create(permission);
  }

  async update(id: string, inputs: PermissionInput[]): Promise<Permission> {
    return this.permissionModel.findByIdAndUpdate(
      id,
      {
        rules: inputs as Rule[],
      },
      {
        new: true,
        useFindAndModify: false,
      },
    );
  }

  async get(id: string): Promise<Permission> {
    const permission = await this.permissionModel.findOne({
      _id: id,
    });

    return permission;
  }

  async delete(permissionIds: string[]): Promise<Permission[]> {
    return Promise.all(
      permissionIds.map(async (it) => {
        return this.permissionModel.findByIdAndDelete(it);
      }),
    );
  }

  async getAllRoleTemplates(): Promise<RoleTemplate[]> {
    return this.roleTemplateModel.find().populate({ path: 'permission' });
  }

  async createRoleTemplate(
    name: string,
    inputs: PermissionInput[],
  ): Promise<RoleTemplate> {
    // max length for name is 200
    if (!this.isValidRoleTemplateName(name)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    // check the duplicated name
    const role = await this.roleTemplateModel.findOne({ name });
    if (role !== null) {
      throw new ApolloError(
        `There is a role template '${name}' in the cityos, please create the new one.`,
        ErrorCode.ROLE_TEMPLATE_DUPLICATED,
      );
    }

    // check the maximum number of role templates
    const roles = await this.getAllRoleTemplates();
    if (roles.length >= Constants.MAXIMUM_NUMBER_FOR_ROLE_TEMPLATES) {
      throw new ApolloError(
        `You cannot create more than ${Constants.MAXIMUM_NUMBER_FOR_ROLE_TEMPLATES} role templates.`,
        ErrorCode.ROLE_TEMPLATES_LIMIT_REACH,
      );
    }

    const permission = await this.create(inputs);
    const roleTemplate = new RoleTemplate();
    roleTemplate.name = name;
    roleTemplate.permission = permission;

    return this.roleTemplateModel.create(roleTemplate);
  }

  async deleteRoleTemplate(templateId: string): Promise<boolean> {
    const role = await this.roleTemplateModel.findByIdAndDelete(templateId);
    return !!(await this.delete([role.permission._id.toHexString()]));
  }

  async editRoleTemplate(
    templateId: string,
    name?: string,
    permissionInputs?: PermissionInput[],
  ): Promise<RoleTemplate> {
    const role = await this.roleTemplateModel.findById(templateId);
    if (!role) {
      throw new ApolloError(
        `Cannot find the role template for '${templateId}' in the cityos.`,
        ErrorCode.ROLE_TEMPLATE_NOT_FOUND,
      );
    }

    if (name !== undefined) {
      // max length for name is 200
      if (!this.isValidRoleTemplateName(name)) {
        throw new ApolloError(
          'Please check the length of your inputs.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }

      // check the duplicated name
      const duplicatedRole = await this.roleTemplateModel.findOne({
        name,
        _id: {
          $ne: new Types.ObjectId(templateId),
        },
      });
      if (duplicatedRole) {
        throw new ApolloError(
          `There is a role template '${name}' in the cityos, please assign a new name.`,
          ErrorCode.ROLE_TEMPLATE_DUPLICATED,
        );
      }
      role.name = name;
    }

    if (permissionInputs !== undefined) {
      const permissionId = role.permission._id.toHexString();
      await this.update(permissionId, permissionInputs);
    }

    return this.roleTemplateModel
      .findByIdAndUpdate(templateId, role, {
        useFindAndModify: false,
        new: true,
      })
      .populate({ path: 'permission' });
  }

  private isValidRoleTemplateName(name?: string): boolean {
    if (name !== undefined) {
      if (name === null || name.length > 200) {
        return false;
      }
    }

    return true;
  }
}
