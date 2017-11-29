import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { withStyles } from 'material-ui/styles';
import axios from 'axios';

import List, { ListItem, ListItemIcon, ListItemText } from 'material-ui/List';
import Snackbar from 'material-ui/Snackbar';
import Chip from 'material-ui/Chip';

import IconButton from 'material-ui/IconButton';
import CloseIcon from 'material-ui-icons/Close';
import FolderIcon from 'material-ui-icons/Folder';
import FolderIconOpen from 'material-ui-icons/FolderOpen';
import AddIcon from 'material-ui-icons/Add';
import ClearIcon from 'material-ui-icons/Clear';
import VisibilityIcon from 'material-ui-icons/Visibility';
import VisibilityOffIcon from 'material-ui-icons/VisibilityOff';;

import { indigo } from 'material-ui/colors';

let _ = require('lodash');
let lib = require("../utils/library.js");

class DbSchema extends Component {
	constructor(props) {
		super(props);
		this.state = {
			dbIndex: props.dbIndex,
			table: props.table,
			dbSchema: null,
			dbFkSchema: null,
			tables: [],
			snackBarVisibility: false,
			snackBarMessage: "Unknown error occured",
			searchTerm: ""
		};
	}

	componentDidMount() {
		// Save the database schema to state for future access
		let url = lib.getDbConfig(this.state.dbIndex, "url");
		if (url) {
			this.getDbSchema(url);
		}
	}

	componentWillReceiveProps(newProps) {
		// If the database was changed, re do the whole view and update parent components too
		if (this.state.dbIndex !== newProps.dbIndex) {
			this.setState({
				dbIndex: newProps.dbIndex,
				table: "",
				tables: []
			}, function() {
				this.props.changeTable("");
				this.props.changeColumns(this.state[""]);
				this.getDbSchema();
				this.updateVisibleColumns();
			});
		} else if (this.state.table !== newProps.table) {
			this.setState({
				table: newProps.table
			});
			this.handleTableClick(newProps.table);
		} else if (this.state.searchTerm !== newProps.searchTerm) {
			this.setState({
				searchTerm: newProps.searchTerm
			}, () => {
				//console.log("TABLE COLUMN SEARCH RESULT SAVED", JSON.stringify(this.searchTablesColumnsFK()));
				this.setState({
					searchResults: this.searchTablesColumnsFK()
				});
			});
		}
	}


	////////////////////////////////////////////////////////////////////////////////////////////////////
	// Search Methods
	////////////////////////////////////////////////////////////////////////////////////////////////////

	// Combines results of this.searchColumns() and this.searchTables() into a dict/JSON object
	searchTablesColumnsFK() {
		let dict = {};

		// Search tables
		_.forEach(this.searchTables(), table => {
			dict[table] = [];
		});

		// Seach columns
		_.forEach(this.searchColumns(), result => {
			dict[result[0]] = result[1];
		});

		// Search foreign keys
		return this.addForeignKeyResults(dict);
	}

	addForeignKeyResults(searchResults) {
		let updatedSearchResults = searchResults;
		// Retrieve a list of foreign keys given a table using the /rpc/foreign_keys endpoint
		// If the search result column has a foreign key, add that table+FK_column to the saerch result

		_.keys(searchResults).forEach(table => {
			if (table !== undefined && searchResults[table] !== undefined && searchResults[table]['columns'] !== undefined) {
				_.forEach(searchResults[table]['columns'], column => {
					let fk_result = _.find(this.state.dbFkSchema, function(fk) {
						return fk.table_name === table && fk.column_name === column;
					});
					if (fk_result !== undefined) {
						updatedSearchResults[table]["foreign_keys"] = {};
							updatedSearchResults[table]["foreign_keys"][column] = {
							"foreign_table": fk_result.foreign_table,
							"foreign_column": fk_result.foreign_column
						};

						// add the FK as a normal search result too (until a good way to indicate FK is figured out)
						// TODO: Indicate FK result clearly ... so user knows why the fk_result.foreign_table shows up even though there isn't any obvious match (potential)
						if (updatedSearchResults[fk_result.foreign_table] && updatedSearchResults[fk_result.foreign_table]["columns"]) {
							// fk_result.foreign_table and columns elements exist for the FK ... just ensure the column is part of columns element
							if (_.find(updatedSearchResults[fk_result.foreign_table]["columns"], fk_result.foreign_column) === -1) {
								// column not found, insert it
								updatedSearchResults[fk_result.foreign_table]["columns"] = updatedSearchResults[fk_result.foreign_table]["columns"].push(fk_result.foreign_column);
							}
						} else if (updatedSearchResults[fk_result.foreign_table] && (updatedSearchResults[fk_result.foreign_table]["columns"] === null || updatedSearchResults[fk_result.foreign_table]["columns"] === undefined)) {
							// fk_result.foreign_table exists but no columns defined for it
							updatedSearchResults[fk_result.foreign_table]["columns"] = updatedSearchResults[fk_result.foreign_table]["columns"].push(fk_result.foreign_column);
						} else {
							// fk_result.foreign_table does not exist, and columns also doesn't.... obv
							updatedSearchResults[fk_result.foreign_table] = {};
							updatedSearchResults[fk_result.foreign_table]["columns"] = [fk_result.foreign_column];
						}
					}
				});
			}
		});

		return updatedSearchResults;
	}

	// Returns a list of tables matching state.saerchTerm from the current tables' raw and rename names
	searchTables() {
		let tableSearchResults = [];
		let searchTerm = (this.state.searchTerm).toLowerCase().split(" ");
		
		for (let i = 0; i < searchTerm.length; i++) {
			let splitTerm = searchTerm[i];
			if (splitTerm !== "") {
				// First search the raw table names as returned by API
				let splitTermResults = (this.state.tables).filter(table => table.toLowerCase().indexOf(splitTerm) > -1);

				// Next search the config file renames
				let splitTermResultsWithRename = (this.state.tables).filter(table => {
					let tableRename = lib.getTableConfig(this.state.dbIndex, table, "rename");
					let displayName = tableRename ? tableRename : table;
					return displayName.toLowerCase().indexOf(splitTerm) > -1;
				});

				// Keep track of the matching tables
				tableSearchResults.push(splitTermResults);
				tableSearchResults.push(splitTermResultsWithRename);
			}
		}
		return _.uniq(_.flattenDeep(tableSearchResults));
	}

	// Returns a list of tables that have columns matching state.saerchTerm from the tables' raw and rename column names
	searchColumns() {
		let tableSearchResults = [];
		let searchTerm = (this.state.searchTerm).toLowerCase().split(" ");
		
		for (let i = 0; i < searchTerm.length; i++) {
			let splitTerm = searchTerm[i];
			if (splitTerm !== "") {
				tableSearchResults.push(this.state.tables.map(table => {
					let matchingColumns = [];
					let currentTableColumns = this.state[table];

					// First search raw table column names
					let splitTermResults = _.compact(currentTableColumns.filter(column => column.toLowerCase().indexOf(splitTerm) > -1));

					// Next search the column renames from config.json
					let splitTermResultsWithRename = _.compact(currentTableColumns.filter(column => {
						let columnRename = lib.getColumnConfig(this.state.dbIndex, table, column, "rename");
						let displayName = columnRename ? columnRename : column;
						return displayName.toLowerCase().indexOf(splitTerm) > -1;
					}));

					// Keep track of matching column names
					matchingColumns.push(splitTermResults);
					matchingColumns.push(splitTermResultsWithRename);

					if (splitTermResults.length > 0 || splitTermResultsWithRename.length > 0) {
						return [table, {columns: _.uniq(_.flattenDeep(matchingColumns))}];
					}
					else {
						return [];
					}
				}));
			}
		}
		return _.uniq(_.compact(_.flatten(tableSearchResults)));
	}


	////////////////////////////////////////////////////////////////////////////////////////////////////
	// HTTP Methods
	////////////////////////////////////////////////////////////////////////////////////////////////////

	// Returns a list of tables from URL
	getDbSchema(url = lib.getDbConfig(this.state.dbIndex, "url")) {
		axios.get(url + "/", { params: {} })
			.then((response) => {
				// Save the raw resp + parse tables and columns...
				this.setState({
					dbSchema: response.data
				}, () => {
					this.parseDbSchema(response.data);
				});
			})
			.catch((error) => {
				// Show error in top-right Snack-Bar
				this.setState({
					snackBarVisibility: true,
					snackBarMessage: "Database does not exist."
				}, () => {
					this.timer = setTimeout(() => {
						this.setState({
							snackBarVisibility: false,
							snackBarMessage: "Unknown error"
						});
					}, 5000);
				});
			});
		
		axios.post(url + "/rpc/foreign_keys_v2", {})
			.then((response) => {
				// Save the raw resp + parse tables and columns...
				this.setState({
					dbFkSchema: response.data
				});
			})
			.catch((error) => {
				// Show error in top-right Snack-Bar
				this.setState({
					snackBarVisibility: true,
					snackBarMessage: "Foreign keys function does not exist in database."
				}, () => {
					this.timer = setTimeout(() => {
						this.setState({
							snackBarVisibility: false,
							snackBarMessage: "Unknown error"
						});
					}, 5000);
				});
			});
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	// Parsing Methods
	////////////////////////////////////////////////////////////////////////////////////////////////////

	// From the JSON resp, extract the names of db TABLES and update state
	parseDbSchema(data = this.state.dbSchema) {
		let dbTables = [];
		for (let i in data.definitions) {
			if (lib.getTableConfig(this.state.dbIndex, i, "visible") !== false) {
				dbTables.push(i);
				this.parseTableColumns(data.definitions[i].properties, i);
			}
		}

		this.setState({
			tables: dbTables
		});

		// Load first table if no table is selected AND if there is no info available about pre-selected table
		if (dbTables[0] !== undefined && dbTables[0] !== null && dbTables[0] !== "" && this.state.table === "") {
			this.handleTableClick(dbTables[0]);
		} else {
			this.handleTableClick(this.state.table, true);
		}
	}

	// From JSON resp, extract the names of table columns and update state
	parseTableColumns(rawColProperties, table) {
		let columns = [];

		for (let i in rawColProperties) { // I = COLUMN in TABLE
			if (lib.getColumnConfig(this.state.dbIndex, table, i, "visible") !== false) {
				// list of columns for TABLE
				columns.push(i);

				let columnDefaultVisibility = lib.isColumnInDefaultView(this.state.dbIndex, table, i);

				// Each COLUMN's visibility stored in state
				if (columnDefaultVisibility === false) {
					this.setState({
						[table + i + "Visibility"]: "hide"
					});
				}
			}
		}

		// Save state
		this.setState({
			[table]: columns
		}, () => {
			if (table === this.state.table) {
				this.props.changeTable(this.state.table);
				this.props.changeColumns(this.state[this.state.table]);
				this.updateVisibleColumns();
			}
		});
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	// Handle click methods
	////////////////////////////////////////////////////////////////////////////////////////////////////

	// Show/hide table based on last visibility
	handleTableOpenClick(clickedTable, skipCheck = false) {
		// skipCheck prevents table schema collapse when leftPane toggles
		if (this.state.hoverTable !== clickedTable || skipCheck) {
			this.setState({
				hoverTable: clickedTable
			}, () => {
				this.updateVisibleColumnsOnHover();
			});
		} else {
			this.setState({
				hoverTable: ""
			}, () => {
				this.updateVisibleColumnsOnHover();
			});
		}
	}

	// Set CLICKEDTABLE in state as TABLE
	handleTableClick(clickedTable, skipCheck = false) {
		// skipCheck prevents table schema collapse when leftPane toggles
		if (this.state.table !== clickedTable || skipCheck) {
			this.setState({
				table: clickedTable
			}, () => {
				this.props.changeTable(clickedTable);
				this.props.changeColumns(this.state[clickedTable]);
				this.updateVisibleColumns();
			});
		} else {
			this.setState({
				table: ""
			}, () => {
				this.props.changeTable("");
				this.props.changeColumns([]);
				this.updateVisibleColumns();
			});
		}
	}

	// Make a column visible or invisible on click
	handleColumnClick(column, table) {
		if (this.state[table + column + "Visibility"] === "hide") {
			this.setState({
				[table + column + "Visibility"]: ""
			}, () => {
				this.updateVisibleColumns();
			});
		} else {
			this.setState({
				[table + column + "Visibility"]: "hide"
			}, () => {
				this.updateVisibleColumns();
			});
		}
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	// Create HTML Elements
	////////////////////////////////////////////////////////////////////////////////////////////////////

	createTableElement(tableName) {
		const truncTextStyle = {
			textOverflow: 'clip',
			overflow: 'hidden',
			width: '29%',
			height: 20
		};

		let tableRename = lib.getTableConfig(this.state.dbIndex, tableName, "rename");
		let displayName = tableRename ? tableRename : tableName;

		let tableColumnElements = [];

		// Update visibility of tables according to the search results, if a search term is entered
		let classNames = this.props.classes.hide;
		if (this.state.searchTerm === "") {
			classNames = null;
		} else if (this.state.searchResults && this.state.searchResults[tableName] !== undefined && this.state.searchResults[tableName] !== null) {
			classNames = null;
		}

		// First push the table itself
		tableColumnElements.push(
			<ListItem button key={this.state.dbIndex+tableName} id={tableName} className={classNames} 
				 title={displayName} onClick={(event) => this.handleTableClick(tableName)} >
				<ListItemIcon >
					{this.state.table === tableName ? <FolderIconOpen className={this.props.classes.primaryColoured} /> : <FolderIcon /> }
				</ListItemIcon>
				<ListItemText primary={displayName} style={truncTextStyle} />
				<ListItemIcon onClick={(event) => {event.stopPropagation(); this.handleTableOpenClick(tableName);}} title="Show columns without loading in Query Builder.">
					{this.state.hoverTable === tableName ? (this.state.table === tableName ? <div></div> : <ClearIcon className={this.props.classes.primaryColoured} />) : (this.state.table === tableName ? <div></div> : <AddIcon />) }
				</ListItemIcon>
			</ListItem>
		);

		// Now push each column as hidden until state.table equals table tableName...
		if (tableName !== "phylogenetic_tree") {
			for (let i in this.state[tableName]) {
				let columnName = this.state[tableName][i];
				tableColumnElements.push(this.createColumnElement(columnName, tableName));
			}	
		}

		return tableColumnElements;
	}

	createColumnElement(columnName, table) {
		let columnRename = lib.getColumnConfig(this.state.dbIndex, table, columnName, "rename");
		let displayName = columnRename ? columnRename : columnName;

		let visibility = this.state[table + columnName + "Visibility"] === "hide" ? false : true;

		// If TABLE is equal to STATE.TABLE (displayed table), show the column element
		let classNames = this.props.classes.column;
		if (this.state.table !== table && this.state.hoverTable !== table) {
			classNames = this.props.classes.column + " " + this.props.classes.hide;
		}

		// Specifically hide columns if they do not belong to current search results
		if (this.state.searchTerm !== "" && this.state.searchResults && (this.state.searchResults[table] === undefined || this.state.searchResults[table] === null)) {
			classNames = this.props.classes.column + " " + this.props.classes.hide;
		}

		return (
			<ListItem button key={columnName+table+this.state.dbIndex} id={columnName}
				 title={displayName} className={classNames} onClick={(event) => this.handleColumnClick(columnName, table)}>
				<ListItemIcon>
					{visibility ? <VisibilityIcon className={this.props.classes.primaryColoured} /> : <VisibilityOffIcon /> }
				</ListItemIcon>
				<ListItemText secondary={displayName} />
			</ListItem>
		);
	}

	handleRequestClose = () => {
		this.setState({ snackBarVisibility: false });
	};

	handleSearchClose = () => {
		this.setState({ searchTerm: "", searchResults: {} });
		this.props.changeSearchTerm("");
	};

	updateVisibleColumns() {
		let columns = this.state[this.state.table];
		let columnVisibility = {};
		let visibleColumns = [];

		if (columns !== undefined) {
			for (let i = 0; i < columns.length; i++) {
				let visibility = this.state[this.state.table + columns[i] + "Visibility"] === "hide" ? false : true;
				columnVisibility[columns[i]] = visibility;
				if (visibility) {
					visibleColumns.push(columns[i]);
				}
			}
		}
		this.props.changeVisibleColumns(visibleColumns);
		/*this.setState({
			[this.state.table + "visibleColumns"]: visibleColumns
		}, () => {
			this.props.changeVisibleColumns(this.state[this.state.table + "visibleColumns"]);
		});*/
	}

	updateVisibleColumnsOnHover() {
		let columns = this.state[this.state.hoverTable];
		let columnVisibility = {};
		let visibleColumns = [];

		if (columns !== undefined) {
			for (let i = 0; i < columns.length; i++) {
				let visibility = this.state[this.state.hoverTable + columns[i] + "Visibility"] === "hide" ? false : true;
				columnVisibility[columns[i]] = visibility;
				if (visibility) {
					visibleColumns.push(columns[i]);
				}
			}
		}
	}

	render() {
		const classes = this.props.classes;
		let searchTermTrucated = this.state.searchTerm;
		if (searchTermTrucated.length > 34) {
			searchTermTrucated = searchTermTrucated.substring(0,34);
			searchTermTrucated += " ...";
		}
		return (
			<div>
				{this.state.searchTerm !== "" ? <Chip label={"Searching: " + searchTermTrucated} className={classes.chipClasses} onRequestDelete={this.handleSearchClose} /> : null}
				<Snackbar 	anchorOrigin={{vertical: "bottom", horizontal: "center"}}
							open={this.state.snackBarVisibility}
							onRequestClose={this.handleRequestClose}
							SnackbarContentProps={{ 'aria-describedby': 'message-id', }}
							message={<span id="message-id">{this.state.snackBarMessage}</span>}
							action={[ <IconButton key="close" aria-label="Close" color="accent" className={classes.close} onClick={this.handleRequestClose}> <CloseIcon /> </IconButton> ]} />
				<List>
					{ this.state.tables.map((table) => {
							// For each table, push TABLE + COLUMN elements
							return (
								this.createTableElement(table)
							);
						})
					}
				</List>
			</div>
		);
	}
}

DbSchema.propTypes = {
	classes: PropTypes.object.isRequired,
};

const styleSheet = {
	column: {
		marginLeft: 27
	},
	hide: {
		display: 'none'
	},
	close: {
		width: 5 * 4,
		height: 5 * 4,
	},
	primaryColoured: {
		fill: indigo[400]
	},
	chipClasses: {
		margin: 5,
		marginTop: 10,
		marginBottom: 0
	}
};

export default withStyles(styleSheet)(DbSchema);